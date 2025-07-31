import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClaudeCodeSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // 初始化设置
        this._settings = this.getSettings();
        
        // 创建主设置页面
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // API提供商组
        this.apiGroup = new Adw.PreferencesGroup({
            title: _('API 提供商'),
            description: _('添加和管理自定义 API 提供商'),
        });
        page.add(this.apiGroup);

        // 添加新提供商按钮
        const addProviderRow = new Adw.ActionRow({
            title: _('添加新提供商'),
            subtitle: _('添加自定义 API 端点和密钥'),
        });
        
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addProviderRow.add_suffix(addButton);
        addProviderRow.set_activatable_widget(addButton);
        this.apiGroup.add(addProviderRow);

        // 默认提供商列表
        const defaultProviderRow = new Adw.ExpanderRow({
            title: _('Anthropic (默认)'),
            subtitle: _('api.anthropic.com'),
        });
        
        // 默认提供商名称编辑框
        const defaultNameRow = new Adw.EntryRow({
            title: _('提供商名称'),
            text: 'Anthropic (默认)',
        });
        
        // 监听默认提供商名称变化
        defaultNameRow.connect('changed', () => {
            const newName = defaultNameRow.get_text();
            defaultProviderRow.set_title(newName);
        });
        
        defaultProviderRow.add_row(defaultNameRow);

        // 默认提供商URL编辑框
        const defaultUrlRow = new Adw.EntryRow({
            title: _('API URL'),
            text: 'api.anthropic.com',
        });
        
        // 监听默认提供商URL变化
        defaultUrlRow.connect('changed', () => {
            const newUrl = defaultUrlRow.get_text();
            defaultProviderRow.set_subtitle(newUrl);
        });
        
        defaultProviderRow.add_row(defaultUrlRow);
        
        // 默认提供商的API密钥输入
        const defaultApiKeyRow = new Adw.PasswordEntryRow({
            title: _('API 密钥'),
        });
        defaultProviderRow.add_row(defaultApiKeyRow);
        
        this.apiGroup.add(defaultProviderRow);

        // 添加按钮点击事件
        addButton.connect('clicked', () => {
            this._showAddProviderDialog(window);
        });

        // 加载已保存的提供商
        this._loadSavedProviders();

        // 关于组
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('关于'),
        });
        page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('Claude Code Switcher'),
            subtitle: _('快速切换 Claude Code API 提供商'),
        });
        aboutGroup.add(aboutRow);
    }

    _showAddProviderDialog(parentWindow) {
        const dialog = new Adw.MessageDialog({
            transient_for: parentWindow,
            heading: _('添加新的 API 提供商'),
            body: _('请输入自定义 API 提供商的详细信息'),
        });

        // 创建输入框容器
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 提供商名称输入
        const nameEntry = new Gtk.Entry({
            placeholder_text: _('提供商名称（例如：OpenAI）'),
        });
        box.append(nameEntry);

        // API URL输入
        const urlEntry = new Gtk.Entry({
            placeholder_text: _('API URL（例如：https://api.openai.com）'),
        });
        box.append(urlEntry);

        // API密钥输入
        const keyEntry = new Gtk.PasswordEntry({
            placeholder_text: _('API 密钥'),
        });
        box.append(keyEntry);

        dialog.set_extra_child(box);
        dialog.add_response('cancel', _('取消'));
        dialog.add_response('add', _('添加'));
        dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'add') {
                const name = nameEntry.get_text();
                const url = urlEntry.get_text();
                const key = keyEntry.get_text();
                
                if (name && url && key) {
                    // 保存到设置中
                    this._saveProvider(name, url, key);
                    // 动态添加新的提供商到界面
                    this._addProviderToUI(name, url, key);
                    console.log(`添加提供商: ${name}, URL: ${url}, Key: ${key}`);
                }
            }
            dialog.destroy();
        });

        dialog.present();
    }

    _addProviderToUI(name, url, key) {
        // 创建新的提供商展开行
        const providerRow = new Adw.ExpanderRow({
            title: name,
            subtitle: url,
        });

        // 添加提供商名称编辑框
        const nameRow = new Adw.EntryRow({
            title: _('提供商名称'),
            text: name,
        });
        
        // 监听名称变化并更新标题
        nameRow.connect('changed', () => {
            const newName = nameRow.get_text();
            providerRow.set_title(newName);
            this._updateProvider(name, newName, urlRow.get_text(), apiKeyRow.get_text());
        });
        
        providerRow.add_row(nameRow);

        // 添加URL编辑框
        const urlRow = new Adw.EntryRow({
            title: _('API URL'),
            text: url,
        });
        
        // 监听URL变化并更新副标题
        urlRow.connect('changed', () => {
            const newUrl = urlRow.get_text();
            providerRow.set_subtitle(newUrl);
            this._updateProvider(name, nameRow.get_text(), newUrl, apiKeyRow.get_text());
        });
        
        providerRow.add_row(urlRow);

        // 添加API密钥显示（已预填）
        const apiKeyRow = new Adw.PasswordEntryRow({
            title: _('API 密钥'),
            text: key,
        });
        
        // 监听API密钥变化
        apiKeyRow.connect('changed', () => {
            this._updateProvider(name, nameRow.get_text(), urlRow.get_text(), apiKeyRow.get_text());
        });
        
        providerRow.add_row(apiKeyRow);

        // 添加删除按钮
        const deleteButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action'],
            tooltip_text: _('删除此提供商'),
        });
        
        deleteButton.connect('clicked', () => {
            this._removeProvider(name);
            this.apiGroup.remove(providerRow);
        });
        
        providerRow.add_suffix(deleteButton);

        // 将新提供商添加到API组中
        this.apiGroup.add(providerRow);
    }

    _loadSavedProviders() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            providers.forEach(provider => {
                this._addProviderToUI(provider.name, provider.url, provider.key);
            });
        } catch (e) {
            console.log('没有找到已保存的提供商或解析失败:', e);
        }
    }

    _saveProvider(name, url, key) {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            providers.push({ name, url, key });
            
            this._settings.set_string('api-providers', JSON.stringify(providers));
        } catch (e) {
            // 如果解析失败，创建新数组
            this._settings.set_string('api-providers', JSON.stringify([{ name, url, key }]));
        }
    }

    _updateProvider(oldName, newName, newUrl, newKey) {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const index = providers.findIndex(p => p.name === oldName);
            if (index !== -1) {
                providers[index] = { name: newName, url: newUrl, key: newKey };
                this._settings.set_string('api-providers', JSON.stringify(providers));
            }
        } catch (e) {
            console.log('更新提供商失败:', e);
        }
    }

    _removeProvider(name) {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const filteredProviders = providers.filter(p => p.name !== name);
            this._settings.set_string('api-providers', JSON.stringify(filteredProviders));
        } catch (e) {
            console.log('删除提供商失败:', e);
        }
    }
}