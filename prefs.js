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
        
        // 保存默认提供商的原始值
        const defaultOriginalValues = {
            name: 'Anthropic (默认)',
            url: 'api.anthropic.com',
            key: ''
        };
        
        // 默认提供商名称编辑框
        const defaultNameRow = new Adw.EntryRow({
            title: _('提供商名称'),
            text: 'Anthropic (默认)',
        });
        
        defaultProviderRow.add_row(defaultNameRow);

        // 默认提供商URL编辑框
        const defaultUrlRow = new Adw.EntryRow({
            title: _('API URL'),
            text: 'api.anthropic.com',
        });
        
        defaultProviderRow.add_row(defaultUrlRow);
        
        // 默认提供商的API密钥输入
        const defaultApiKeyRow = new Adw.PasswordEntryRow({
            title: _('API 密钥'),
        });
        defaultProviderRow.add_row(defaultApiKeyRow);

        // 默认提供商操作按钮
        const defaultActionRow = new Adw.ActionRow({
            title: _('操作'),
        });

        const defaultButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        const defaultCancelButton = new Gtk.Button({
            label: _('取消'),
            css_classes: ['flat'],
        });

        const defaultSaveButton = new Gtk.Button({
            label: _('保存'),
            css_classes: ['suggested-action'],
        });

        defaultButtonBox.append(defaultCancelButton);
        defaultButtonBox.append(defaultSaveButton);
        defaultActionRow.add_suffix(defaultButtonBox);
        defaultProviderRow.add_row(defaultActionRow);

        // 默认提供商取消按钮逻辑
        defaultCancelButton.connect('clicked', () => {
            defaultNameRow.set_text(defaultOriginalValues.name);
            defaultUrlRow.set_text(defaultOriginalValues.url);
            defaultApiKeyRow.set_text(defaultOriginalValues.key);
            defaultProviderRow.set_title(defaultOriginalValues.name);
            defaultProviderRow.set_subtitle(defaultOriginalValues.url);
            
            // 自动收起展开行
            defaultProviderRow.set_expanded(false);
        });

        // 默认提供商保存按钮逻辑
        defaultSaveButton.connect('clicked', () => {
            const newName = defaultNameRow.get_text();
            const newUrl = defaultUrlRow.get_text();
            const newKey = defaultApiKeyRow.get_text();

            if (newName && newUrl && newKey) {
                defaultProviderRow.set_title(newName);
                defaultProviderRow.set_subtitle(newUrl);
                defaultOriginalValues.name = newName;
                defaultOriginalValues.url = newUrl;
                defaultOriginalValues.key = newKey;
                console.log(`保存默认提供商配置: ${newName}`);
            } else {
                console.log('所有字段都必须填写');
            }
        });
        
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

        // 大模型输入（非必填）
        const largeModelEntry = new Gtk.Entry({
            placeholder_text: _('大模型（可选，例如：claude-3-5-sonnet-20241022）'),
        });
        box.append(largeModelEntry);

        // 小模型输入（非必填）
        const smallModelEntry = new Gtk.Entry({
            placeholder_text: _('小模型（可选，例如：claude-3-haiku-20240307）'),
        });
        box.append(smallModelEntry);

        dialog.set_extra_child(box);
        dialog.add_response('cancel', _('取消'));
        dialog.add_response('add', _('添加'));
        dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'add') {
                const name = nameEntry.get_text();
                const url = urlEntry.get_text();
                const key = keyEntry.get_text();
                const largeModel = largeModelEntry.get_text() || ''; // 非必填，默认为空
                const smallModel = smallModelEntry.get_text() || ''; // 非必填，默认为空
                
                if (name && url && key) {
                    // 保存到设置中
                    this._saveProvider(name, url, key, largeModel, smallModel);
                    // 动态添加新的提供商到界面
                    this._addProviderToUI(name, url, key, largeModel, smallModel);
                    console.log(`添加提供商: ${name}, URL: ${url}, Key: ${key}, 大模型: ${largeModel}, 小模型: ${smallModel}`);
                }
            }
            dialog.destroy();
        });

        dialog.present();
    }

    _addProviderToUI(name, url, key, largeModel = '', smallModel = '') {
        // 创建新的提供商展开行
        const providerRow = new Adw.ExpanderRow({
            title: name,
            subtitle: url,
        });

        // 保存原始值用于取消操作
        const originalValues = { name, url, key, largeModel, smallModel };

        // 添加提供商名称编辑框
        const nameRow = new Adw.EntryRow({
            title: _('提供商名称'),
            text: name,
        });
        
        providerRow.add_row(nameRow);

        // 添加URL编辑框
        const urlRow = new Adw.EntryRow({
            title: _('API URL'),
            text: url,
        });
        
        providerRow.add_row(urlRow);

        // 添加API密钥显示（已预填）
        const apiKeyRow = new Adw.PasswordEntryRow({
            title: _('API 密钥'),
            text: key,
        });
        
        providerRow.add_row(apiKeyRow);

        // 添加大模型编辑框
        const largeModelRow = new Adw.EntryRow({
            title: _('大模型'),
            text: largeModel,
        });
        
        providerRow.add_row(largeModelRow);

        // 添加小模型编辑框
        const smallModelRow = new Adw.EntryRow({
            title: _('小模型'),
            text: smallModel,
        });
        
        providerRow.add_row(smallModelRow);

        // 添加操作按钮行
        const actionRow = new Adw.ActionRow({
            title: _('操作'),
        });

        // 创建按钮容器
        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        // 取消按钮
        const cancelButton = new Gtk.Button({
            label: _('取消'),
            css_classes: ['flat'],
        });

        // 保存按钮
        const saveButton = new Gtk.Button({
            label: _('保存'),
            css_classes: ['suggested-action'],
        });

        buttonBox.append(cancelButton);
        buttonBox.append(saveButton);
        actionRow.add_suffix(buttonBox);
        providerRow.add_row(actionRow);

        // 取消按钮逻辑
        cancelButton.connect('clicked', () => {
            // 恢复原始值
            nameRow.set_text(originalValues.name);
            urlRow.set_text(originalValues.url);
            apiKeyRow.set_text(originalValues.key);
            largeModelRow.set_text(originalValues.largeModel);
            smallModelRow.set_text(originalValues.smallModel);
            
            // 更新标题和副标题
            providerRow.set_title(originalValues.name);
            providerRow.set_subtitle(originalValues.url);
            
            // 自动收起展开行
            providerRow.set_expanded(false);
        });

        // 保存按钮逻辑
        saveButton.connect('clicked', () => {
            const newName = nameRow.get_text();
            const newUrl = urlRow.get_text();
            const newKey = apiKeyRow.get_text();
            const newLargeModel = largeModelRow.get_text();
            const newSmallModel = smallModelRow.get_text();

            if (newName && newUrl && newKey) {
                // 更新保存的配置
                this._updateProvider(originalValues.name, newName, newUrl, newKey, newLargeModel, newSmallModel);
                
                // 更新界面标题和副标题
                providerRow.set_title(newName);
                providerRow.set_subtitle(newUrl);
                
                // 更新原始值为新值
                originalValues.name = newName;
                originalValues.url = newUrl;
                originalValues.key = newKey;
                originalValues.largeModel = newLargeModel;
                originalValues.smallModel = newSmallModel;
                
                // 可选：显示保存成功的提示
                console.log(`保存提供商配置: ${newName}`);
            } else {
                // 显示错误提示
                console.log('名称、URL和API密钥都必须填写');
            }
        });

        // 添加删除按钮
        const deleteButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action'],
            tooltip_text: _('删除此提供商'),
        });
        
        deleteButton.connect('clicked', () => {
            this._showDeleteConfirmDialog(name, providerRow);
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
                this._addProviderToUI(
                    provider.name, 
                    provider.url, 
                    provider.key,
                    provider.largeModel || '',
                    provider.smallModel || ''
                );
            });
        } catch (e) {
            console.log('没有找到已保存的提供商或解析失败:', e);
        }
    }

    _saveProvider(name, url, key, largeModel = '', smallModel = '') {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            providers.push({ name, url, key, largeModel, smallModel });
            
            this._settings.set_string('api-providers', JSON.stringify(providers));
        } catch (e) {
            // 如果解析失败，创建新数组
            this._settings.set_string('api-providers', JSON.stringify([{ name, url, key, largeModel, smallModel }]));
        }
    }

    _updateProvider(oldName, newName, newUrl, newKey, newLargeModel = '', newSmallModel = '') {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const index = providers.findIndex(p => p.name === oldName);
            if (index !== -1) {
                providers[index] = { 
                    name: newName, 
                    url: newUrl, 
                    key: newKey, 
                    largeModel: newLargeModel, 
                    smallModel: newSmallModel 
                };
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

    _showDeleteConfirmDialog(providerName, providerRow) {
        const dialog = new Adw.MessageDialog({
            transient_for: this.apiGroup.get_root(),
            heading: _('确认删除'),
            body: _(`确定要删除提供商"${providerName}"吗？\n\n此操作无法撤销。`),
        });

        dialog.add_response('cancel', _('取消'));
        dialog.add_response('delete', _('删除'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._removeProvider(providerName);
                this.apiGroup.remove(providerRow);
            }
            dialog.destroy();
        });

        dialog.present();
    }
}