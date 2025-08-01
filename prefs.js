import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ClaudeCodeSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // 快速初始化基础UI
        this._setupBasicUI(window);
        
        // 直接加载复杂内容
        this._loadComplexContent();
    }
    
    _setupBasicUI(window) {
        // 初始化设置
        this._settings = this.getSettings();
        this._window = window;
        
        // 创建主设置页面
        this._page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(this._page);

        // 显示加载提示
        this._loadingGroup = new Adw.PreferencesGroup({
            title: _('正在加载...'),
            description: _('请稍候，正在初始化设置界面'),
        });
        this._page.add(this._loadingGroup);
    }
    
    _loadComplexContent() {
        // 移除加载提示
        this._page.remove(this._loadingGroup);
        
        // API提供商组
        this.apiGroup = new Adw.PreferencesGroup({
            title: _('API 提供商'),
            description: _('添加和管理自定义 API 提供商'),
        });
        this._page.add(this.apiGroup);

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

        // 添加按钮点击事件
        addButton.connect('clicked', () => {
            this._showAddProviderDialog(this._window, this._settings);
        });

        // 延迟加载已保存的提供商以提升响应性
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._loadSavedProviders(this._settings);
            return GLib.SOURCE_REMOVE;
        });

        // 全局设置组
        const globalGroup = new Adw.PreferencesGroup({
            title: _('全局设置'),
            description: _('配置扩展的全局选项'),
        });
        this._page.add(globalGroup);

        // 自动更新开关
        const autoUpdateRow = new Adw.SwitchRow({
            title: _('自动更新'),
            subtitle: _('启用扩展的自动更新功能'),
        });
        globalGroup.add(autoUpdateRow);

        // 绑定自动更新设置
        this._settings.bind('auto-update', autoUpdateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // 使用延迟加载代理设置UI以提升性能
        this._setupProxySettings(globalGroup);

        // 添加窗口关闭清理事件
        this._window.connect('close-request', () => {
            this._cleanup();
            return false;
        });

        // 关于组
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('关于'),
        });
        this._page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('Claude Code Switcher'),
            subtitle: _('快速切换 Claude Code API 提供商'),
        });
        aboutGroup.add(aboutRow);
    }
    
    _setupProxySettings(globalGroup) {
        // 代理设置展开行
        const proxyRow = new Adw.ExpanderRow({
            title: _('代理设置'),
            subtitle: _('配置网络代理服务器'),
        });
        globalGroup.add(proxyRow);

        // 当展开时才创建子项以提升性能
        let proxyContentCreated = false;
        proxyRow.connect('notify::expanded', () => {
            if (proxyRow.expanded && !proxyContentCreated) {
                this._createProxyContent(proxyRow);
                proxyContentCreated = true;
            }
        });
        
        // 初始化代理展开行的副标题
        const currentHost = this._settings.get_string('proxy-host');
        const currentPort = this._settings.get_string('proxy-port');
        if (currentHost && currentPort) {
            proxyRow.set_subtitle(_(`已配置: ${currentHost}:${currentPort}`));
        } else if (currentHost) {
            proxyRow.set_subtitle(_(`已配置: ${currentHost}`));
        }
    }
    
    _createProxyContent(proxyRow) {
        // 代理主机输入
        const proxyHostRow = new Adw.EntryRow({
            title: _('代理服务器'),
            text: this._settings.get_string('proxy-host'),
        });
        proxyRow.add_row(proxyHostRow);

        // 代理端口输入
        const proxyPortRow = new Adw.EntryRow({
            title: _('端口'),
            text: this._settings.get_string('proxy-port'),
        });
        proxyRow.add_row(proxyPortRow);

        // 代理设置操作按钮
        const proxyActionRow = new Adw.ActionRow({
            title: _('操作'),
        });

        const proxyButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        const proxyCancelButton = new Gtk.Button({
            label: _('取消'),
            css_classes: ['flat'],
        });

        const proxySaveButton = new Gtk.Button({
            label: _('保存'),
            css_classes: ['suggested-action'],
        });

        proxyButtonBox.append(proxyCancelButton);
        proxyButtonBox.append(proxySaveButton);
        proxyActionRow.add_suffix(proxyButtonBox);
        proxyRow.add_row(proxyActionRow);

        // 保存代理设置的原始值
        const proxyOriginalValues = {
            host: this._settings.get_string('proxy-host'),
            port: this._settings.get_string('proxy-port'),
        };

        // 代理取消按钮逻辑
        proxyCancelButton.connect('clicked', () => {
            proxyHostRow.set_text(proxyOriginalValues.host);
            proxyPortRow.set_text(proxyOriginalValues.port);
            proxyRow.set_expanded(false);
        });

        // 代理保存按钮逻辑
        proxySaveButton.connect('clicked', () => {
            const newHost = proxyHostRow.get_text();
            const newPort = proxyPortRow.get_text();

            this._settings.set_string('proxy-host', newHost);
            this._settings.set_string('proxy-port', newPort);
            
            proxyOriginalValues.host = newHost;
            proxyOriginalValues.port = newPort;
            
            if (newHost && newPort) {
                proxyRow.set_subtitle(_(`已配置: ${newHost}:${newPort}`));
            } else if (newHost) {
                proxyRow.set_subtitle(_(`已配置: ${newHost}`));
            } else {
                proxyRow.set_subtitle(_('配置网络代理服务器'));
            }
            
            proxyRow.set_expanded(false);
            this._syncToLocalFile(this._settings);
            
            console.log(`保存代理设置: ${newHost}:${newPort}`);
        });
    }
    
    _cleanup() {
        // 清理引用以避免内存泄漏
        this._settings = null;
        this._window = null;
        this._page = null;
        this.apiGroup = null;
    }

    _showAddProviderDialog(parentWindow, settings) {
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
                    this._saveProvider(name, url, key, largeModel, smallModel, settings);
                    // 动态添加新的提供商到界面
                    this._addProviderToUI(name, url, key, largeModel, smallModel, settings);
                    // 同步到本地文件
                    this._syncToLocalFile(settings);
                    console.log(`添加提供商: ${name}, URL: ${url}, Key: ${key}, 大模型: ${largeModel}, 小模型: ${smallModel}`);
                }
            }
            dialog.destroy();
        });

        dialog.present();
    }

    _addProviderToUI(name, url, key, largeModel = '', smallModel = '', settings) {
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
                this._updateProvider(originalValues.name, newName, newUrl, newKey, newLargeModel, newSmallModel, settings);
                
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
                this._syncToLocalFile(settings);
                
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
            this._showDeleteConfirmDialog(name, providerRow, settings);
        });
        
        providerRow.add_suffix(deleteButton);

        // 将新提供商添加到API组中
        this.apiGroup.add(providerRow);
    }

    _loadSavedProviders(settings) {
        try {
            const providersJson = settings.get_string('api-providers');
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
                        provider.smallModel || '',
                        settings
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
            console.log('没有找到已保存的提供商或解析失败:', e);
        }
    }

    _saveProvider(name, url, key, largeModel = '', smallModel = '', settings) {
        try {
            const providersJson = settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            providers.push({ name, url, key, largeModel, smallModel });
            
            settings.set_string('api-providers', JSON.stringify(providers));
        } catch (e) {
            // 如果解析失败，创建新数组
            settings.set_string('api-providers', JSON.stringify([{ name, url, key, largeModel, smallModel }]));
        }
    }

    _updateProvider(oldName, newName, newUrl, newKey, newLargeModel = '', newSmallModel = '', settings) {
        try {
            const providersJson = settings.get_string('api-providers');
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
                settings.set_string('api-providers', JSON.stringify(providers));
            }
        } catch (e) {
            console.log('更新提供商失败:', e);
        }
    }

    _removeProvider(name, settings) {
        try {
            const providersJson = settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const filteredProviders = providers.filter(p => p.name !== name);
            settings.set_string('api-providers', JSON.stringify(filteredProviders));
        } catch (e) {
            console.log('删除提供商失败:', e);
        }
    }

    _showDeleteConfirmDialog(providerName, providerRow, settings) {
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
                this._removeProvider(providerName, settings);
                this.apiGroup.remove(providerRow);
            }
            dialog.destroy();
        });

        dialog.present();
    }

    /**
     * 获取Claude配置文件路径 ~/.claude/settings.json
     */
    _getClaudeConfigPath() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        return GLib.build_filenamev([claudeDir, 'settings.json']);
    }
    
    /**
     * 确保Claude配置目录存在
     */
    _ensureClaudeDir() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        const dir = Gio.File.new_for_path(claudeDir);
        
        if (!dir.query_exists(null)) {
            try {
                dir.make_directory(null);
                console.log('创建Claude配置目录:', claudeDir);
            } catch (e) {
                console.error('创建Claude配置目录失败:', e);
                return false;
            }
        }
        return true;
    }
    
    /**
     * 读取现有的settings.json文件
     */
    _readExistingConfig() {
        const configPath = this._getClaudeConfigPath();
        const file = Gio.File.new_for_path(configPath);
        
        if (!file.query_exists(null)) {
            return null;
        }
        
        try {
            const [success, contents] = file.load_contents(null);
            if (success) {
                const decoder = new TextDecoder('utf-8');
                const jsonString = decoder.decode(contents);
                return JSON.parse(jsonString);
            }
        } catch (e) {
            console.error('读取Claude配置文件失败:', e);
        }
        
        return null;
    }
    
    /**
     * 获取当前选中的提供商信息
     */
    _getCurrentProviderInfo(settings) {
        try {
            const providersJson = settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProviderName = settings.get_string('current-provider');
            
            if (!currentProviderName) {
                return null;
            }
            
            return providers.find(p => p.name === currentProviderName);
        } catch (e) {
            console.error('获取当前提供商信息失败:', e);
            return null;
        }
    }
    
    /**
     * 生成标准的Claude配置对象
     */
    _generateClaudeConfig(settings) {
        const currentProvider = this._getCurrentProviderInfo(settings);
        const autoUpdate = settings.get_boolean('auto-update');
        const proxyHost = settings.get_string('proxy-host');
        const proxyPort = settings.get_string('proxy-port');
        
        // 构建代理URL
        let proxyUrl = '';
        if (proxyHost) {
            proxyUrl = proxyPort ? `${proxyHost}:${proxyPort}` : proxyHost;
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                proxyUrl = `http://${proxyUrl}`;
            }
        }
        
        // 读取现有配置以保留其他字段
        const existingConfig = this._readExistingConfig() || {};
        
        const config = {
            env: {
                ANTHROPIC_AUTH_TOKEN: currentProvider ? currentProvider.key : '',
                ANTHROPIC_BASE_URL: currentProvider ? currentProvider.url : '',
                ANTHROPIC_MODEL: currentProvider ? (currentProvider.largeModel || '') : '',
                ANTHROPIC_SMALL_FAST_MODEL: currentProvider ? (currentProvider.smallModel || '') : '',
                DISABLE_AUTOUPDATER: autoUpdate ? '0' : '1', // 注意：0表示不禁用，1表示禁用
                HTTPS_PROXY: proxyUrl,
                HTTP_PROXY: proxyUrl
            },
            permissions: existingConfig.permissions || {
                allow: [],
                deny: []
            },
            feedbackSurveyState: existingConfig.feedbackSurveyState || {
                lastShownTime: Date.now()
            }
        };
        
        return config;
    }
    
    /**
     * 同步配置到本地Claude配置文件
     */
    _syncToLocalFile(settings) {
        if (!this._ensureClaudeDir()) {
            return;
        }
        
        const configPath = this._getClaudeConfigPath();
        const config = this._generateClaudeConfig(settings);
        
        try {
            const jsonString = JSON.stringify(config, null, 2);
            const file = Gio.File.new_for_path(configPath);
            
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonString);
            
            file.replace_contents(
                bytes,
                null, // etag
                false, // make_backup
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null // cancellable
            );
            
            console.log('已同步配置到Claude配置文件:', configPath);
        } catch (e) {
            console.error('写入Claude配置文件失败:', e);
        }
    }

}