import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {TokenStatsManager, TokenStats} from './tokenStats.js';

export default class ClaudeCodeSwitcherPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
        this.tokenStatsManager = new TokenStatsManager();
        this.statsWidgets = {
            totalCostLabel: null,
            totalSessionsLabel: null,
            totalTokensLabel: null,
            lastUpdatedLabel: null,
            refreshButton: null
        };
    }

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
            title: _('Loading...'),
            description: _('Please wait, initializing settings interface'),
        });
        this._page.add(this._loadingGroup);
    }
    
    _loadComplexContent() {
        // 移除加载提示
        this._page.remove(this._loadingGroup);
        
        // Token 使用统计仪表盘
        this._addTokenStatsGroup();

        // API提供商组
        this.apiGroup = new Adw.PreferencesGroup({
            title: _('API Providers'),
            description: _('Add and manage custom API providers'),
        });
        this._page.add(this.apiGroup);

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
            this._showAddProviderDialog(this._window, this._settings);
        });

        // 延迟加载已保存的提供商以提升响应性
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._loadSavedProviders(this._settings);
            return GLib.SOURCE_REMOVE;
        });

        // 全局设置组
        const globalGroup = new Adw.PreferencesGroup({
            title: _('Global Settings'),
            description: _('Configure global extension options'),
        });
        this._page.add(globalGroup);

        // 自动更新开关
        const autoUpdateRow = new Adw.SwitchRow({
            title: _('Auto Update'),
            subtitle: _('Enable automatic updates for the extension'),
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
            title: _('About'),
        });
        this._page.add(aboutGroup);

        const aboutRow = new Adw.ActionRow({
            title: _('Claude Code Switcher'),
            subtitle: _('Quickly switch Claude Code API providers'),
        });
        aboutGroup.add(aboutRow);
    }
    
    _setupProxySettings(globalGroup) {
        // 代理设置展开行
        const proxyRow = new Adw.ExpanderRow({
            title: _('Proxy Settings'),
            subtitle: _('Configure network proxy server'),
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
            proxyRow.set_subtitle(_('Configured: ') + currentHost + ':' + currentPort);
        } else if (currentHost) {
            proxyRow.set_subtitle(_('Configured: ') + currentHost);
        }
    }
    
    _createProxyContent(proxyRow) {
        // 代理主机输入
        const proxyHostRow = new Adw.EntryRow({
            title: _('Proxy Server'),
            text: this._settings.get_string('proxy-host'),
        });
        proxyRow.add_row(proxyHostRow);

        // 代理端口输入
        const proxyPortRow = new Adw.EntryRow({
            title: _('Port'),
            text: this._settings.get_string('proxy-port'),
        });
        proxyRow.add_row(proxyPortRow);

        // 代理设置操作按钮
        const proxyActionRow = new Adw.ActionRow({
            title: _('Actions'),
        });

        const proxyButtonBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            halign: Gtk.Align.END,
        });

        const proxyCancelButton = new Gtk.Button({
            label: _('Cancel'),
            css_classes: ['flat'],
        });

        const proxySaveButton = new Gtk.Button({
            label: _('Save'),
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
                proxyRow.set_subtitle(_('Configured: ') + newHost + ':' + newPort);
            } else if (newHost) {
                proxyRow.set_subtitle(_('Configured: ') + newHost);
            } else {
                proxyRow.set_subtitle(_('Configure network proxy server'));
            }
            
            proxyRow.set_expanded(false);
            this._syncToLocalFile(this._settings);
            
            console.log('Saved proxy settings: ' + newHost + ':' + newPort);
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
                    this._saveProvider(name, url, key, largeModel, smallModel, settings);
                    // 动态添加新的提供商到界面
                    this._addProviderToUI(name, url, key, largeModel, smallModel, settings);
                    // 同步到本地文件
                    this._syncToLocalFile(settings);
                    console.log('Added provider: ' + name + ', URL: ' + url + ', Key: ' + key + ', Large Model: ' + largeModel + ', Small Model: ' + smallModel);
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
                console.log('Saved provider configuration: ' + newName);
            } else {
                // 显示错误提示
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
            console.log('No saved providers found or parsing failed:', e);
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
            console.log('Failed to update provider:', e);
        }
    }

    _removeProvider(name, settings) {
        try {
            const providersJson = settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            
            const filteredProviders = providers.filter(p => p.name !== name);
            settings.set_string('api-providers', JSON.stringify(filteredProviders));
        } catch (e) {
            console.log('Failed to remove provider:', e);
        }
    }

    _showDeleteConfirmDialog(providerName, providerRow, settings) {
        const dialog = new Adw.MessageDialog({
            transient_for: this.apiGroup.get_root(),
            heading: _('Confirm Delete'),
            body: _('Are you sure you want to delete provider "') + providerName + _('"\n\nThis action cannot be undone.'),
        });

        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
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
                console.log('Created Claude config directory:', claudeDir);
            } catch (e) {
                console.error('Failed to create Claude config directory:', e);
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
            console.error('Failed to read Claude config file:', e);
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
            console.error('Failed to get current provider info:', e);
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
                DISABLE_AUTOUPDATER: autoUpdate ? '0' : '1',
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
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
            
            console.log('Synced config to Claude config file:', configPath);
        } catch (e) {
            console.error('Failed to write Claude config file:', e);
        }
    }

    /**
     * 添加 Token 统计仪表盘组
     */
    _addTokenStatsGroup() {
        const statsGroup = new Adw.PreferencesGroup({
            title: _('INFO'),
            description: _('View your Claude Code API usage and costs'),
        });
        this._page.add(statsGroup);

        // 创建统计卡片的网格布局
        const statsGrid = new Gtk.Grid({
            row_spacing: 12,
            column_spacing: 12,
            column_homogeneous: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 总成本卡片
        const costBox = this._createStatsCard(
            _('Total Cost'),
            '$0.0000',
            'img/icons/cash.svg'
        );
        this.statsWidgets.totalCostLabel = costBox.get_last_child().get_first_child().get_next_sibling();
        statsGrid.attach(costBox, 0, 0, 1, 1);

        // 总会话数卡片（可点击按钮）
        const sessionsButton = this._createClickableStatsCard(
            _('Total Sessions'),
            '0',
            'img/icons/archive-fill.svg',
            () => this._showSessionsDetailDialog()
        );
        // 使用存储在按钮上的valueLabel属性
        this.statsWidgets.totalSessionsLabel = sessionsButton._valueLabel;
        statsGrid.attach(sessionsButton, 1, 0, 1, 1);

        // 总令牌数卡片
        const tokensBox = this._createStatsCard(
            _('Total Tokens'),
            '0',
            'img/icons/claude.svg'
        );
        this.statsWidgets.totalTokensLabel = tokensBox.get_last_child().get_first_child().get_next_sibling();
        statsGrid.attach(tokensBox, 2, 0, 1, 1);

        // 创建一个包装器来居中显示网格
        const statsWrapper = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
        });
        statsWrapper.append(statsGrid);

        // 添加刷新按钮和最后更新时间
        const controlsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
        });

        this.statsWidgets.refreshButton = new Gtk.Button({
            label: _('Refresh Stats'),
        });

        this.statsWidgets.lastUpdatedLabel = new Gtk.Label({
            label: _('Not loaded yet'),
        });

        controlsBox.append(this.statsWidgets.refreshButton);
        controlsBox.append(this.statsWidgets.lastUpdatedLabel);
        
        statsWrapper.append(controlsBox);

        // 创建包含统计内容的行
        const statsRow = new Adw.ActionRow();
        statsRow.set_child(statsWrapper);
        statsGroup.add(statsRow);

        // 连接刷新按钮事件
        this.statsWidgets.refreshButton.connect('clicked', () => {
            this._refreshTokenStats();
        });

        // 初始加载统计数据
        this._refreshTokenStats();
    }

    /**
     * 创建可点击的统计卡片
     */
    _createClickableStatsCard(title, value, iconPath, clickCallback) {
        const cardButton = new Gtk.Button({
            css_classes: ['flat'],
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // 图标
        let icon;
        if (iconPath.startsWith('img/')) {
            // 自定义SVG文件路径
            const fullPath = GLib.build_filenamev([this.path, iconPath]);
            icon = new Gtk.Image({
                gicon: Gio.icon_new_for_string(fullPath),
                pixel_size: 32,
            });
        } else {
            // 系统图标名称
            icon = new Gtk.Image({
                icon_name: iconPath,
                pixel_size: 32,
            });
        }

        // 文本容器
        const textBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            halign: Gtk.Align.START,
        });

        const valueLabel = new Gtk.Label({
            label: value,
            halign: Gtk.Align.START,
        });

        textBox.append(titleLabel);
        textBox.append(valueLabel);

        cardBox.append(icon);
        cardBox.append(textBox);
        
        cardButton.set_child(cardBox);

        // 连接点击事件
        if (clickCallback) {
            cardButton.connect('clicked', clickCallback);
        }

        // 将valueLabel作为属性存储在按钮上，方便后续访问
        cardButton._valueLabel = valueLabel;

        return cardButton;
    }

    /**
     * 创建统计卡片
     */
    _createStatsCard(title, value, iconPath) {
        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8,
        });

        // 图标
        let icon;
        if (iconPath.startsWith('img/')) {
            // 自定义SVG文件路径
            const fullPath = GLib.build_filenamev([this.path, iconPath]);
            icon = new Gtk.Image({
                gicon: Gio.icon_new_for_string(fullPath),
                pixel_size: 32,
            });
        } else {
            // 系统图标名称
            icon = new Gtk.Image({
                icon_name: iconPath,
                pixel_size: 32,
            });
        }

        // 文本容器
        const textBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const titleLabel = new Gtk.Label({
            label: title,
            halign: Gtk.Align.START,
        });

        const valueLabel = new Gtk.Label({
            label: value,
            halign: Gtk.Align.START,
        });

        textBox.append(titleLabel);
        textBox.append(valueLabel);

        cardBox.append(icon);
        cardBox.append(textBox);

        return cardBox;
    }

    /**
     * 显示会话详情对话框
     */
    async _showSessionsDetailDialog() {
        const dialog = new Adw.Window({
            transient_for: this._window,
            modal: true,
            title: _('Sessions Detail (Beta)'),
            default_width: 800,
            default_height: 600,
        });

        // Adw.Window 有内置的header bar，不需要额外设置
        // 只需要设置窗口的标题和subtitle
        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        // 创建滚动窗口
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hexpand: true,
            vexpand: true,
        });

        // 创建主容器
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 加载状态指示器
        const loadingBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32,
        });

        const loadingLabel = new Gtk.Label({
            label: _('Loading session data...'),
        });

        loadingBox.append(spinner);
        loadingBox.append(loadingLabel);
        mainBox.append(loadingBox);

        scrolledWindow.set_child(mainBox);
        toolbarView.set_content(scrolledWindow);
        dialog.set_content(toolbarView);

        // 显示对话框
        dialog.present();

        try {
            // 异步加载会话数据
            const sessionsDetail = await this.tokenStatsManager.getSessionsDetailAsync();
            
            // 移除加载指示器
            mainBox.remove(loadingBox);

            if (sessionsDetail.length === 0) {
                const emptyLabel = new Gtk.Label({
                    label: _('No session data found'),
                    valign: Gtk.Align.CENTER,
                    halign: Gtk.Align.CENTER,
                });
                mainBox.append(emptyLabel);
                return;
            }

            // 创建会话列表
            const sessionsList = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
            });

            for (const session of sessionsDetail) {
                const sessionCard = this._createSessionCard(session);
                sessionsList.append(sessionCard);
            }

            mainBox.append(sessionsList);

        } catch (error) {
            console.error('Failed to load sessions detail:', error);
            
            // 移除加载指示器
            mainBox.remove(loadingBox);
            
            const errorLabel = new Gtk.Label({
                label: _('Failed to load session data'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            mainBox.append(errorLabel);
        }
    }

    /**
     * 创建会话卡片
     */
    _createSessionCard(session) {
        // 创建展开行
        const sessionRow = new Adw.ExpanderRow({
            title: `Session ${session.sessionId.substring(0, 8)}...`,
            subtitle: `${TokenStats.formatCurrency(session.totalCost)} • ${session.messageCount} messages • ${TokenStats.formatNumber(session.totalTokens)} tokens`,
        });

        // 会话基本信息
        const infoGroup = new Adw.PreferencesGroup();
        
        // 会话ID
        const sessionIdRow = new Adw.ActionRow({
            title: _('Session ID'),
            subtitle: session.sessionId,
        });
        infoGroup.add(sessionIdRow);

        // 时间范围
        const timeRangeRow = new Adw.ActionRow({
            title: _('Time Range'),
            subtitle: `${new Date(session.firstTimestamp).toLocaleString()} - ${new Date(session.lastTimestamp).toLocaleString()}`,
        });
        infoGroup.add(timeRangeRow);

        // 使用的模型
        const modelsRow = new Adw.ActionRow({
            title: _('Models Used'),
            subtitle: session.models.join(', '),
        });
        infoGroup.add(modelsRow);

        // Token详细信息
        const tokenDetailsRow = new Adw.ActionRow({
            title: _('Token Details'),
            subtitle: `Input: ${TokenStats.formatNumber(session.totalInputTokens)} • Output: ${TokenStats.formatNumber(session.totalOutputTokens)} • Cache: ${TokenStats.formatNumber(session.totalCacheCreationTokens + session.totalCacheReadTokens)}`,
        });
        infoGroup.add(tokenDetailsRow);

        // 添加"查看会话"按钮行
        const viewSessionRow = new Adw.ActionRow({
            title: _('Actions'),
        });
        
        const viewSessionButton = new Gtk.Button({
            label: _('View Session'),
            css_classes: ['suggested-action'],
            valign: Gtk.Align.CENTER,
        });
        
        viewSessionButton.connect('clicked', () => {
            this._showSessionContentDialog(session.sessionId);
        });
        
        viewSessionRow.add_suffix(viewSessionButton);
        infoGroup.add(viewSessionRow);

        // 将信息组添加到展开行中
        sessionRow.add_row(infoGroup);

        return sessionRow;
    }

    /**
     * 显示会话内容对话框
     */
    async _showSessionContentDialog(sessionId) {
        const dialog = new Adw.Window({
            transient_for: this._window,
            modal: true,
            title: _('Session Content'),
            default_width: 900,
            default_height: 700,
        });

        // 使用正确的Adwaita窗口结构
        const toolbarView = new Adw.ToolbarView();
        const headerBar = new Adw.HeaderBar({
            title_widget: new Adw.WindowTitle({
                title: _('Session Content'),
                subtitle: `Session ID: ${sessionId.substring(0, 12)}...`,
            }),
        });
        toolbarView.add_top_bar(headerBar);

        // 创建滚动窗口
        const scrolledWindow = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            hexpand: true,
            vexpand: true,
        });

        // 创建主容器
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        // 创建消息列表容器
        const messagesList = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 16,
            hexpand: true,
        });

        // 进度指示器
        const progressContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
        });

        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 32,
            height_request: 32,
        });

        const progressLabel = new Gtk.Label({
            label: _('Loading session messages...'),
        });

        const progressBar = new Gtk.ProgressBar({
            width_request: 300,
            show_text: true,
        });

        progressContainer.append(spinner);
        progressContainer.append(progressLabel);
        progressContainer.append(progressBar);

        mainBox.append(progressContainer);
        mainBox.append(messagesList);
        scrolledWindow.set_child(mainBox);
        toolbarView.set_content(scrolledWindow);
        dialog.set_content(toolbarView);

        // 显示对话框
        dialog.present();

        try {
            // 异步分批加载消息
            await this._loadMessagesProgressively(sessionId, messagesList, progressContainer, progressLabel, progressBar);

        } catch (error) {
            console.error('Failed to load session messages:', error);
            
            // 移除进度指示器
            mainBox.remove(progressContainer);
            
            const errorLabel = new Gtk.Label({
                label: _('Failed to load session messages'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            mainBox.append(errorLabel);
        }
    }

    /**
     * 分批异步加载消息
     */
    async _loadMessagesProgressively(sessionId, messagesList, progressContainer, progressLabel, progressBar) {
        // 首先获取消息总数
        progressLabel.set_label(_('Analyzing messages...'));
        progressBar.set_fraction(0.1);
        
        const messages = await this.tokenStatsManager.getSessionMessagesAsync(sessionId);
        
        if (messages.length === 0) {
            progressContainer.get_parent().remove(progressContainer);
            const emptyLabel = new Gtk.Label({
                label: _('No messages found in this session'),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
            });
            messagesList.append(emptyLabel);
            return;
        }

        const batchSize = 3; // 每批处理3条消息，更频繁的UI更新
        const totalBatches = Math.ceil(messages.length / batchSize);
        
        progressLabel.set_label(_('Loading messages...'));
        progressBar.set_fraction(0.2);

        // 分批处理消息
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, messages.length);
            const batchMessages = messages.slice(startIndex, endIndex);

            // 更新进度
            const progress = 0.2 + (batchIndex / totalBatches) * 0.7;
            progressBar.set_fraction(progress);
            progressLabel.set_label(_('Loading messages...') + ` (${endIndex}/${messages.length})`);

            // 创建消息卡片
            for (const message of batchMessages) {
                const messageCard = this._createMessageCard(message);
                messagesList.append(messageCard);
            }

            // 让UI有时间更新，避免卡顿
            await this._yield();
        }

        // 完成加载
        progressBar.set_fraction(1.0);
        progressLabel.set_label(_('Loading complete') + ` - ${messages.length} messages loaded`);
        
        console.log(`Session ${sessionId}: loaded ${messages.length} messages`);
        for (let i = 0; i < Math.min(messages.length, 5); i++) {
            const msg = messages[i];
            console.log(`Message ${i}: ${msg.role}, type: ${msg.type}, content: ${JSON.stringify(msg.content).substring(0, 100)}`);
        }
        
        // 延迟移除进度指示器，让用户看到完成信息
        // 使用多次yield来实现延迟效果，而不是timeout
        for (let i = 0; i < 30; i++) { // 大约30次idle循环的延迟
            await this._yield();
        }
        progressContainer.get_parent().remove(progressContainer);
    }

    /**
     * 异步处理函数，用于让出控制权给UI更新
     */
    _yield() {
        return new Promise(resolve => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    /**
     * 创建消息卡片
     */
    _createMessageCard(message) {
        // 根据消息角色选择不同的样式
        const cardCssClasses = ['card'];
        if (message.role === 'user') {
            cardCssClasses.push('user-message');
        } else if (message.role === 'assistant') {
            cardCssClasses.push('assistant-message');
        } else if (message.role === 'tool_result') {
            cardCssClasses.push('tool-result-message');
        }

        // 创建消息卡片
        const messageCard = new Gtk.Frame({
            margin_bottom: 8,
            css_classes: cardCssClasses,
            hexpand: true,
        });

        const cardBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            hexpand: true,
        });

        // 消息头部（角色、时间、模型）
        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
        });

        // 角色标签 - 为用户和助手使用不同的图标和样式
        const roleIcon = this._getRoleIcon(message.role);
        const roleLabel = new Gtk.Label({
            label: `${roleIcon} ${this._formatRole(message.role)}`,
            css_classes: ['heading'],
            halign: Gtk.Align.START,
            use_markup: true,
        });

        // 时间标签
        const timeLabel = new Gtk.Label({
            label: new Date(message.timestamp).toLocaleString(),
            css_classes: ['dim-label'],
            halign: Gtk.Align.END,
            hexpand: true,
        });

        headerBox.append(roleLabel);
        headerBox.append(timeLabel);
        cardBox.append(headerBox);

        // 模型信息（只对助手消息显示）
        if (message.model && message.role === 'assistant') {
            const modelLabel = new Gtk.Label({
                label: `📋 Model: ${message.model}`,
                css_classes: ['caption'],
                halign: Gtk.Align.START,
                use_markup: true,
            });
            cardBox.append(modelLabel);
        }

        // 消息内容
        const contentInfo = this._extractMessageContentWithDetails(message.content);
        if (contentInfo.text || contentInfo.hasComplexContent) {
            this._addMessageContent(cardBox, message, contentInfo);
        }

        // Token使用信息（只对助手消息显示）
        if (message.usage && Object.keys(message.usage).length > 0 && message.role === 'assistant') {
            const usageText = this._formatUsageInfo(message.usage);
            if (usageText) {
                const usageLabel = new Gtk.Label({
                    label: `🔢 ${usageText}`,
                    css_classes: ['caption', 'dim-label'],
                    halign: Gtk.Align.START,
                    use_markup: true,
                });
                cardBox.append(usageLabel);
            }
        }

        messageCard.set_child(cardBox);
        return messageCard;
    }

    /**
     * 获取角色图标
     */
    _getRoleIcon(role) {
        const roleIcons = {
            'user': '👤',
            'assistant': '🤖',
            'system': '⚙️',
            'tool_result': '🔧',
            'unknown': '❓'
        };
        return roleIcons[role] || '❓';
    }

    /**
     * 格式化角色名称
     */
    _formatRole(role) {
        const roleMap = {
            'user': _('User'),
            'assistant': _('Assistant'), 
            'system': _('System'),
            'tool_result': _('Tool Result'),
            'unknown': _('Unknown')
        };
        return roleMap[role] || role;
    }

    /**
     * 提取消息内容并分析详细信息
     */
    _extractMessageContentWithDetails(content) {
        if (!content) {
            return { text: '', hasComplexContent: false, items: [] };
        }

        // 如果content是字符串，直接返回
        if (typeof content === 'string') {
            return { 
                text: content, 
                hasComplexContent: false, 
                items: [{ type: 'text', text: content }] 
            };
        }

        // 如果content不是数组，尝试转换
        if (!Array.isArray(content)) {
            const strContent = String(content);
            return { 
                text: strContent, 
                hasComplexContent: false, 
                items: [{ type: 'text', text: strContent }] 
            };
        }

        let text = '';
        let hasComplexContent = false;
        const items = [];

        for (const item of content) {
            items.push(item);
            
            if (item.type === 'text' && item.text) {
                text += item.text + '\n';
            } else if (item.type === 'tool_use') {
                hasComplexContent = true;
                text += `🔧 Tool Call: ${item.name}\n`;
            } else if (item.type === 'tool_result') {
                hasComplexContent = true;
                text += `🔧 Tool Result\n`;
            }
        }
        
        // 如果文本很长也认为是复杂内容
        if (text.length > 500) {
            hasComplexContent = true;
        }

        return { 
            text: text.trim(), 
            hasComplexContent, 
            items 
        };
    }

    /**
     * 添加消息内容到卡片
     */
    _addMessageContent(cardBox, message, contentInfo) {
        if (!contentInfo.hasComplexContent) {
            // 简单内容直接显示
            const contentLabel = new Gtk.Label({
                label: contentInfo.text,
                wrap: true,
                wrap_mode: Pango.WrapMode.WORD_CHAR,
                selectable: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.START,
                xalign: 0,
                css_classes: message.role === 'user' ? ['user-content'] : ['assistant-content'],
                hexpand: true,
            });
            // 设置自适应宽度
            contentLabel.set_size_request(-1, -1);
            cardBox.append(contentLabel);
        } else {
            // 复杂内容使用可折叠的展开行
            const expanderRow = new Adw.ExpanderRow({
                title: _('Message Content'),
                subtitle: this._getContentSummary(contentInfo.items),
            });

            // 创建详细内容组
            const detailGroup = new Adw.PreferencesGroup();
            
            for (const item of contentInfo.items) {
                const itemRow = this._createContentItemRow(item);
                if (itemRow) {
                    detailGroup.add(itemRow);
                }
            }

            expanderRow.add_row(detailGroup);
            cardBox.append(expanderRow);
        }
    }

    /**
     * 获取内容摘要
     */
    _getContentSummary(items) {
        const summary = [];
        let textCount = 0;
        let toolCount = 0;
        let resultCount = 0;

        for (const item of items) {
            if (item.type === 'text') {
                textCount++;
            } else if (item.type === 'tool_use') {
                toolCount++;
            } else if (item.type === 'tool_result') {
                resultCount++;
            }
        }

        if (textCount > 0) summary.push(`${textCount} text`);
        if (toolCount > 0) summary.push(`${toolCount} tool calls`);
        if (resultCount > 0) summary.push(`${resultCount} results`);

        return summary.join(' • ');
    }

    /**
     * 创建内容项行
     */
    _createContentItemRow(item) {
        if (item.type === 'text' && item.text) {
            const textRow = new Adw.ExpanderRow({
                title: '📝 Text Content',
                subtitle: `${item.text.substring(0, 100)}${item.text.length > 100 ? '...' : ''}`,
            });

            const textLabel = new Gtk.Label({
                label: item.text,
                wrap: true,
                wrap_mode: Pango.WrapMode.WORD_CHAR,
                selectable: true,
                halign: Gtk.Align.FILL,
                valign: Gtk.Align.START,
                xalign: 0,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 8,
                margin_end: 8,
                hexpand: true,
            });
            textLabel.set_size_request(-1, -1);

            const textGroup = new Adw.PreferencesGroup();
            const textActionRow = new Adw.ActionRow();
            textActionRow.set_child(textLabel);
            textGroup.add(textActionRow);
            textRow.add_row(textGroup);

            return textRow;
        } else if (item.type === 'tool_use') {
            const toolRow = new Adw.ExpanderRow({
                title: `🔧 Tool Call: ${item.name}`,
                subtitle: item.tool_use_id ? `ID: ${item.tool_use_id.substring(0, 12)}...` : 'Tool execution',
            });

            const toolGroup = new Adw.PreferencesGroup();

            // 工具名称
            const nameRow = new Adw.ActionRow({
                title: _('Tool Name'),
                subtitle: item.name,
            });
            toolGroup.add(nameRow);

            // 工具ID
            if (item.tool_use_id) {
                const idRow = new Adw.ActionRow({
                    title: _('Tool Use ID'),
                    subtitle: item.tool_use_id,
                });
                toolGroup.add(idRow);
            }

            // 参数
            if (item.input) {
                const inputStr = typeof item.input === 'object' ? 
                    JSON.stringify(item.input, null, 2) : String(item.input);
                
                const paramsRow = new Adw.ExpanderRow({
                    title: _('Parameters'),
                    subtitle: `${Object.keys(item.input).length} parameters`,
                });

                const paramsLabel = new Gtk.Label({
                    label: inputStr,
                    wrap: true,
                    wrap_mode: Pango.WrapMode.WORD_CHAR,
                    selectable: true,
                    halign: Gtk.Align.FILL,
                    valign: Gtk.Align.START,
                    xalign: 0,
                    margin_top: 8,
                    margin_bottom: 8,
                    margin_start: 8,
                    margin_end: 8,
                    css_classes: ['monospace'],
                    hexpand: true,
                });
                paramsLabel.set_size_request(-1, -1);

                const paramsGroup = new Adw.PreferencesGroup();
                const paramsActionRow = new Adw.ActionRow();
                paramsActionRow.set_child(paramsLabel);
                paramsGroup.add(paramsActionRow);
                paramsRow.add_row(paramsGroup);
                toolGroup.add(paramsRow);
            }

            toolRow.add_row(toolGroup);
            return toolRow;
        } else if (item.type === 'tool_result') {
            const resultRow = new Adw.ExpanderRow({
                title: '🔧 Tool Result',
                subtitle: item.tool_use_id ? `ID: ${item.tool_use_id.substring(0, 12)}...` : 'Tool response',
            });

            const resultGroup = new Adw.PreferencesGroup();

            // 工具ID
            if (item.tool_use_id) {
                const idRow = new Adw.ActionRow({
                    title: _('Tool Use ID'),
                    subtitle: item.tool_use_id,
                });
                resultGroup.add(idRow);
            }

            // 结果内容
            if (item.content) {
                let contentText = '';
                if (Array.isArray(item.content)) {
                    for (const resultItem of item.content) {
                        if (resultItem.type === 'text' && resultItem.text) {
                            contentText += resultItem.text + '\n';
                        }
                    }
                } else if (typeof item.content === 'string') {
                    contentText = item.content;
                } else {
                    contentText = JSON.stringify(item.content, null, 2);
                }

                if (contentText) {
                    const contentRow = new Adw.ExpanderRow({
                        title: _('Result Content'),
                        subtitle: `${contentText.substring(0, 100)}${contentText.length > 100 ? '...' : ''}`,
                    });

                    const contentLabel = new Gtk.Label({
                        label: contentText.trim(),
                        wrap: true,
                        wrap_mode: Pango.WrapMode.WORD_CHAR,
                        selectable: true,
                        halign: Gtk.Align.FILL,
                        valign: Gtk.Align.START,
                        xalign: 0,
                        margin_top: 8,
                        margin_bottom: 8,
                        margin_start: 8,
                        margin_end: 8,
                        css_classes: ['monospace'],
                        hexpand: true,
                    });
                    contentLabel.set_size_request(-1, -1);

                    const contentGroup = new Adw.PreferencesGroup();
                    const contentActionRow = new Adw.ActionRow();
                    contentActionRow.set_child(contentLabel);
                    contentGroup.add(contentActionRow);
                    contentRow.add_row(contentGroup);
                    resultGroup.add(contentRow);
                }
            }

            resultRow.add_row(resultGroup);
            return resultRow;
        }

        return null;
    }

    /**
     * 格式化使用信息
     */
    _formatUsageInfo(usage) {
        const parts = [];
        
        if (usage.input_tokens) {
            parts.push(`Input: ${TokenStats.formatNumber(usage.input_tokens)}`);
        }
        if (usage.output_tokens) {
            parts.push(`Output: ${TokenStats.formatNumber(usage.output_tokens)}`);
        }
        if (usage.cache_creation_input_tokens) {
            parts.push(`Cache Write: ${TokenStats.formatNumber(usage.cache_creation_input_tokens)}`);
        }
        if (usage.cache_read_input_tokens) {
            parts.push(`Cache Read: ${TokenStats.formatNumber(usage.cache_read_input_tokens)}`);
        }
        
        return parts.length > 0 ? `Tokens: ${parts.join(' • ')}` : '';
    }

    /**
     * 刷新 Token 统计数据
     */
    async _refreshTokenStats() {
        // 设置刷新按钮为加载状态
        this.statsWidgets.refreshButton.set_sensitive(false);
        this.statsWidgets.refreshButton.set_label(_('Loading...'));
        this.statsWidgets.lastUpdatedLabel.set_label(_('Fetching data...'));

        try {
            // 异步获取统计数据
            const stats = await this.tokenStatsManager.getTokenStatsAsync();
            
            // 更新界面
            this.statsWidgets.totalCostLabel.set_label(TokenStats.formatCurrency(stats.totalCost));
            this.statsWidgets.totalSessionsLabel.set_label(stats.totalSessions.toString());
            this.statsWidgets.totalTokensLabel.set_label(TokenStats.formatNumber(stats.totalTokens));
            
            const now = new Date();
            const timeStr = now.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            this.statsWidgets.lastUpdatedLabel.set_label(_('Last updated: ') + timeStr);

            console.log('Token stats refreshed successfully');
        } catch (error) {
            console.error('Failed to refresh token stats:', error);
            this.statsWidgets.totalCostLabel.set_label(_('Failed to load'));
            this.statsWidgets.totalSessionsLabel.set_label(_('Error'));
            this.statsWidgets.totalTokensLabel.set_label(_('Error'));
            this.statsWidgets.lastUpdatedLabel.set_label(_('Failed to load'));
        } finally {
            // 恢复刷新按钮状态
            this.statsWidgets.refreshButton.set_sensitive(true);
            this.statsWidgets.refreshButton.set_label(_('Refresh Stats'));
        }
    }

}