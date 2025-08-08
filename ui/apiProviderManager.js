import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * API提供商管理器
 * 负责提供商的增删改查和UI展示
 */
export class ApiProviderManager {
    constructor(settings, settingsManager) {
        this.settings = settings;
        this.settingsManager = settingsManager;
        this.apiGroup = null;
    }

    /**
     * 创建API提供商组
     */
    createApiGroup(parentWindow) {
        this.parentWindow = parentWindow;
        
        this.apiGroup = new Adw.PreferencesGroup({
            title: _('API Providers'),
            description: _('Add and manage custom API providers'),
        });

        const addProviderRow = new Adw.ActionRow({
            title: _('Add New Provider'),
            subtitle: _('Add custom API endpoint and key'),
        });
        
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        addProviderRow.add_suffix(addButton);
        addProviderRow.set_activatable_widget(addButton);
        this.apiGroup.add(addProviderRow);

        // 添加按钮点击事件
        addButton.connect('clicked', () => {
            this._showAddProviderDialog();
        });

        // 延迟加载已保存的提供商以提升响应性
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._loadSavedProviders();
            return GLib.SOURCE_REMOVE;
        });

        return this.apiGroup;
    }

    /**
     * 显示添加提供商对话框
     */
    _showAddProviderDialog() {
        const dialog = new Adw.MessageDialog({
            transient_for: this.parentWindow,
            heading: _('Add New API Provider'),
            body: _('Please enter the details for the custom API provider'),
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
            placeholder_text: _('Provider name (e.g.: OpenAI)'),
        });
        box.append(nameEntry);

        // API URL输入
        const urlEntry = new Gtk.Entry({
            placeholder_text: _('API URL (e.g.: https://api.openai.com)'),
        });
        box.append(urlEntry);

        // API密钥输入
        const keyEntry = new Gtk.PasswordEntry({
            placeholder_text: _('API Key'),
        });
        box.append(keyEntry);

        // 大模型输入（非必填）
        const largeModelEntry = new Gtk.Entry({
            placeholder_text: _('Large Model (optional, e.g.: claude-3-5-sonnet-20241022)'),
        });
        box.append(largeModelEntry);

        // 小模型输入（非必填）
        const smallModelEntry = new Gtk.Entry({
            placeholder_text: _('Small Model (optional, e.g.: claude-3-haiku-20240307)'),
        });
        box.append(smallModelEntry);

        dialog.set_extra_child(box);
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('add', _('Add'));
        dialog.set_response_appearance('add', Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (dialog, response) => {
            if (response === 'add') {
                const name = nameEntry.get_text();
                const url = urlEntry.get_text();
                const key = keyEntry.get_text();
                const largeModel = largeModelEntry.get_text() || '';
                const smallModel = smallModelEntry.get_text() || '';
                
                if (name && url && key) {
                    // 保存到设置中
                    this._saveProvider(name, url, key, largeModel, smallModel);
                    // 动态添加新的提供商到界面
                    this._addProviderToUI(name, url, key, largeModel, smallModel);
                    // 同步到本地文件
                    this.settingsManager.syncToLocalFile();
                    console.log('Added provider: ' + name + ', URL: ' + url + ', Key: ' + key + ', Large Model: ' + largeModel + ', Small Model: ' + smallModel);
                }
            }
            dialog.destroy();
        });

        dialog.present();
    }

    /**
     * 添加提供商到UI界面
     */
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
            title: _('Provider Name'),
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
            title: _('API Key'),
            text: key,
        });
        providerRow.add_row(apiKeyRow);

        // 添加大模型编辑框
        const largeModelRow = new Adw.EntryRow({
            title: _('Large Model'),
            text: largeModel,
        });
        providerRow.add_row(largeModelRow);

        // 添加小模型编辑框
        const smallModelRow = new Adw.EntryRow({
            title: _('Small Model'),
            text: smallModel,
        });
        providerRow.add_row(smallModelRow);

        // 添加操作按钮行
        const actionRow = new Adw.ActionRow({
            title: _('Actions'),
        });

        // 创建按钮容器
        const buttonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        // 取消按钮
        const cancelButton = new Gtk.Button({
            label: _('Cancel'),
            css_classes: ['flat'],
        });

        // 保存按钮
        const saveButton = new Gtk.Button({
            label: _('Save'),
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
                
                // 同步到本地文件
                this.settingsManager.syncToLocalFile();
                console.log('Saved provider configuration: ' + newName);
            } else {
                console.log('Name, URL and API key are all required');
            }
        });

        // 添加删除按钮
        const deleteButton = new Gtk.Button({
            icon_name: 'user-trash-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat', 'destructive-action'],
            tooltip_text: _('Delete this provider'),
        });
        
        deleteButton.connect('clicked', () => {
            this._showDeleteConfirmDialog(name, providerRow);
        });
        
        providerRow.add_suffix(deleteButton);

        // 将新提供商添加到API组中
        this.apiGroup.add(providerRow);
    }

    /**
     * 加载保存的提供商
     */
    _loadSavedProviders() {
        try {
            const providersJson = this.settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            // 分批加载提供商UI以避免阻塞
            let index = 0;
            const loadNextProvider = () => {
                if (index < providers.length) {
                    const provider = providers[index];
                    this._addProviderToUI(
                        provider.name, 
                        provider.url, 
                        provider.key,
                        provider.largeModel || '',
                        provider.smallModel || ''
                    );
                    index++;
                    // 使用idle_add分批处理
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        loadNextProvider();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            };
            loadNextProvider();
        } catch (e) {
            console.log('No saved providers found or parsing failed:', e);
        }
    }

    /**
     * 保存提供商
     */
    _saveProvider(name, url, key, largeModel = '', smallModel = '') {
        try {
            const providersJson = this.settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            providers.push({ name, url, key, largeModel, smallModel });
            
            this.settings.set_string('api-providers', JSON.stringify(providers));
        } catch (e) {
            // 如果解析失败，创建新数组
            this.settings.set_string('api-providers', JSON.stringify([{ name, url, key, largeModel, smallModel }]));
        }
    }

    /**
     * 更新提供商
     */
    _updateProvider(oldName, newName, newUrl, newKey, newLargeModel = '', newSmallModel = '') {
        try {
            const providersJson = this.settings.get_string('api-providers');
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
                this.settings.set_string('api-providers', JSON.stringify(providers));
            }
        } catch (e) {
            console.log('Failed to update provider:', e);
        }
    }

    /**
     * 删除提供商
     */
    _removeProvider(name) {
        try {
            const providersJson = this.settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const filteredProviders = providers.filter(p => p.name !== name);
            this.settings.set_string('api-providers', JSON.stringify(filteredProviders));
        } catch (e) {
            console.log('Failed to remove provider:', e);
        }
    }

    /**
     * 显示删除确认对话框
     */
    _showDeleteConfirmDialog(providerName, providerRow) {
        const dialog = new Adw.MessageDialog({
            transient_for: this.apiGroup.get_root(),
            heading: _('Confirm Delete'),
            body: _('Are you sure you want to delete provider \"') + providerName + _('\"\\n\\nThis action cannot be undone.'),
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', (dialog, response) => {
            if (response === 'delete') {
                this._removeProvider(providerName);
                this.apiGroup.remove(providerRow);
                this.settingsManager.syncToLocalFile();
            }
            dialog.destroy();
        });

        dialog.present();
    }
}