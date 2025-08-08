import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// 导入模块化组件
import {StatsPanel} from './ui/statsPanel.js';
import {ApiProviderManager} from './ui/apiProviderManager.js';
import {SettingsManager} from './lib/settingsManager.js';

/**
 * Claude Code Switcher 设置界面
 * 重构后的主文件，专注于界面组装和组件协调
 */
export default class ClaudeCodeSwitcherPreferences extends ExtensionPreferences {
    constructor(metadata) {
        super(metadata);
        
        // 初始化管理器
        this.settingsManager = null;
        this.statsPanel = null;
        this.apiProviderManager = null;
    }

    fillPreferencesWindow(window) {
        // 初始化设置和管理器
        this._initializeManagers(window);
        
        // 快速初始化基础UI
        this._setupBasicUI(window);
        
        // 异步加载复杂内容
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._loadComplexContent();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * 初始化各种管理器
     */
    _initializeManagers(window) {
        this._settings = this.getSettings();
        this._window = window;
        
        // 初始化管理器实例
        this.settingsManager = new SettingsManager(this._settings);
        this.statsPanel = new StatsPanel(this.path);
        this.apiProviderManager = new ApiProviderManager(this._settings, this.settingsManager);
    }
    
    /**
     * 设置基础UI结构
     */
    _setupBasicUI(window) {
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
    
    /**
     * 加载复杂UI内容
     */
    _loadComplexContent() {
        // 移除加载提示
        this._page.remove(this._loadingGroup);
        
        // 1. 添加统计仪表盘
        this.statsPanel.setParentWindow(this._window); // 设置父窗口引用
        const statsGroup = this.statsPanel.createStatsGroup();
        this._page.add(statsGroup);

        // 2. 添加API提供商管理
        const apiGroup = this.apiProviderManager.createApiGroup(this._window);
        this._page.add(apiGroup);

        // 3. 添加通知设置组
        this._addNotificationsGroup();

        // 4. 添加全局设置组
        this._addGlobalSettingsGroup();

        // 5. 添加关于组
        this._addAboutGroup();

        // 添加窗口关闭清理事件
        this._window.connect('close-request', () => {
            this._cleanup();
            return false;
        });
    }

    /**
     * 添加通知设置组
     */
    _addNotificationsGroup() {
        const notificationsGroup = new Adw.PreferencesGroup({
            title: _('Notifications'),
            description: _('Configure Claude Code hooks notifications'),
        });
        this._page.add(notificationsGroup);

        // 通知主开关（使用 ExpanderRow 实现展开/折叠）
        const notificationsToggle = new Adw.ExpanderRow({
            title: _('Enable Notifications'),
            subtitle: _('Enable Claude Code hooks notifications'),
            show_enable_switch: true,
        });
        notificationsGroup.add(notificationsToggle);

        // 绑定主开关到设置
        this._settings.bind('notifications-enabled', notificationsToggle, 'enable_expansion',
            Gio.SettingsBindFlags.DEFAULT);

        // 添加钩子事件开关
        this._addHookEventSwitches(notificationsToggle);
    }

    /**
     * 添加钩子事件开关
     */
    _addHookEventSwitches(notificationsToggle) {
        const hookEvents = [
            {
                key: 'normal-exit',
                title: _('Normal Exit Notifications'),
                subtitle: _('Show notifications when Claude Code exits normally (exit code 0)'),
            },
            {
                key: 'abnormal-exit',
                title: _('Abnormal Exit Notifications'),
                subtitle: _('Show notifications when Claude Code exits abnormally (non-zero exit codes)'),
            },
        ];

        hookEvents.forEach(hook => {
            const switchRow = new Adw.SwitchRow({
                title: hook.title,
                subtitle: hook.subtitle,
            });
            
            this._settings.bind(`hook-${hook.key}`, switchRow, 'active',
                Gio.SettingsBindFlags.DEFAULT);
            
            notificationsToggle.add_row(switchRow);
        });
    }

    /**
     * 添加全局设置组
     */
    _addGlobalSettingsGroup() {
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

        this._settings.bind('auto-update', autoUpdateRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        // 代理设置
        this._setupProxySettings(globalGroup);
    }

    /**
     * 设置代理设置UI
     */
    _setupProxySettings(globalGroup) {
        const proxyRow = new Adw.ExpanderRow({
            title: _('Proxy Settings'),
            subtitle: _('Configure network proxy server'),
        });
        globalGroup.add(proxyRow);

        // 延迟创建代理内容以提升性能
        let proxyContentCreated = false;
        proxyRow.connect('notify::expanded', () => {
            if (proxyRow.expanded && !proxyContentCreated) {
                this._createProxyContent(proxyRow);
                proxyContentCreated = true;
            }
        });
        
        // 初始化代理展开行的副标题
        const {host, port} = this.settingsManager.getProxyInfo();
        if (host && port) {
            proxyRow.set_subtitle(_('Configured: ') + host + ':' + port);
        } else if (host) {
            proxyRow.set_subtitle(_('Configured: ') + host);
        }
    }

    /**
     * 创建代理设置内容
     */
    _createProxyContent(proxyRow) {
        const {host, port} = this.settingsManager.getProxyInfo();

        // 代理主机输入
        const proxyHostRow = new Adw.EntryRow({
            title: _('Proxy Server'),
            text: host,
        });
        proxyRow.add_row(proxyHostRow);

        // 代理端口输入
        const proxyPortRow = new Adw.EntryRow({
            title: _('Port'),
            text: port,
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

        // 保存原始值
        const originalValues = {host, port};

        // 取消按钮逻辑
        proxyCancelButton.connect('clicked', () => {
            proxyHostRow.set_text(originalValues.host);
            proxyPortRow.set_text(originalValues.port);
            proxyRow.set_expanded(false);
        });

        // 保存按钮逻辑
        proxySaveButton.connect('clicked', () => {
            const newHost = proxyHostRow.get_text();
            const newPort = proxyPortRow.get_text();

            this.settingsManager.setProxy(newHost, newPort);
            
            originalValues.host = newHost;
            originalValues.port = newPort;
            
            if (newHost && newPort) {
                proxyRow.set_subtitle(_('Configured: ') + newHost + ':' + newPort);
            } else if (newHost) {
                proxyRow.set_subtitle(_('Configured: ') + newHost);
            } else {
                proxyRow.set_subtitle(_('Configure network proxy server'));
            }
            
            proxyRow.set_expanded(false);
            console.log('Saved proxy settings: ' + newHost + ':' + newPort);
        });
    }

    /**
     * 添加关于组
     */
    _addAboutGroup() {
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
    
    /**
     * 清理资源
     */
    _cleanup() {
        this._settings = null;
        this._window = null;
        this._page = null;
        this.settingsManager = null;
        this.statsPanel = null;
        this.apiProviderManager = null;
    }
}