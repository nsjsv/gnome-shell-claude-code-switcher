import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// 导入模块化组件
import {StatsPanel} from './ui/statsPanel.js';
import {ApiProviderManager} from './ui/apiProviderManager.js';
import {SettingsManager} from './lib/settingsManager.js';
import {GlobalSettingsGroup} from './ui/globalSettingsGroup.js';
import {AboutGroup} from './ui/aboutGroup.js';
import {NotificationsGroup} from './ui/notificationsGroup.js';

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
        this.globalSettingsGroup = null;
        this.aboutGroup = null;
        this.notificationsGroup = null;
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
        this.globalSettingsGroup = new GlobalSettingsGroup(this._settings, this.settingsManager);
        this.aboutGroup = new AboutGroup(this.metadata);
        this.notificationsGroup = new NotificationsGroup(this._settings);
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
        const notificationsGroup = this.notificationsGroup.createNotificationsGroup();
        this._page.add(notificationsGroup);

        // 4. 添加全局设置组
        const globalGroup = this.globalSettingsGroup.createGlobalSettingsGroup();
        this._page.add(globalGroup);

        // 5. 添加关于组
        const aboutGroup = this.aboutGroup.createAboutGroup();
        this._page.add(aboutGroup);

        // 添加窗口关闭清理事件
        this._window.connect('close-request', () => {
            this._cleanup();
            return false;
        });
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
        this.globalSettingsGroup = null;
        this.aboutGroup = null;
        this.notificationsGroup = null;
    }
}