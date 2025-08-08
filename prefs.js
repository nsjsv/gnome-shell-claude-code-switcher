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
        
        // 使用更高效的异步加载策略
        this._scheduleComplexContentLoading();
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
     * 调度复杂内容加载
     */
    _scheduleComplexContentLoading() {
        // 使用分批加载策略，避免UI阻塞
        const loadingSteps = [
            () => this._loadStatsPanel(),
            () => this._loadApiProviderManager(),
            () => this._loadNotificationsGroup(),
            () => this._loadGlobalSettingsGroup(),
            () => this._loadAboutGroup(),
            () => this._finalizeLoading()
        ];
        
        let currentStep = 0;
        const executeNextStep = () => {
            if (currentStep < loadingSteps.length) {
                try {
                    loadingSteps[currentStep]();
                    currentStep++;
                    // 使用idle_add确保UI响应性
                    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                        executeNextStep();
                        return GLib.SOURCE_REMOVE;
                    });
                } catch (e) {
                    console.error(`Error in loading step ${currentStep}:`, e);
                    currentStep++;
                    executeNextStep();
                }
            }
        };
        
        // 开始加载
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            executeNextStep();
            return GLib.SOURCE_REMOVE;
        });
    }
    
    /**
     * 加载统计面板
     */
    _loadStatsPanel() {
        if (this._loadingGroup && this._loadingGroup.get_parent()) {
            this._page.remove(this._loadingGroup);
            this._loadingGroup = null;
        }
        
        this.statsPanel.setParentWindow(this._window);
        const statsGroup = this.statsPanel.createStatsGroup();
        this._page.add(statsGroup);
    }
    
    /**
     * 加载API提供商管理器
     */
    _loadApiProviderManager() {
        const apiGroup = this.apiProviderManager.createApiGroup(this._window);
        this._page.add(apiGroup);
    }
    
    /**
     * 加载通知设置组
     */
    _loadNotificationsGroup() {
        const notificationsGroup = this.notificationsGroup.createNotificationsGroup();
        this._page.add(notificationsGroup);
    }
    
    /**
     * 加载全局设置组
     */
    _loadGlobalSettingsGroup() {
        const globalGroup = this.globalSettingsGroup.createGlobalSettingsGroup();
        this._page.add(globalGroup);
    }
    
    /**
     * 加载关于组
     */
    _loadAboutGroup() {
        const aboutGroup = this.aboutGroup.createAboutGroup();
        this._page.add(aboutGroup);
    }
    
    /**
     * 完成加载
     */
    _finalizeLoading() {
        // 添加窗口关闭清理事件
        if (this._window && !this._cleanupConnected) {
            this._window.connect('close-request', () => {
                this._cleanup();
                return false;
            });
            this._cleanupConnected = true;
        }
    }

    
    /**
     * 清理资源
     */
    _cleanup() {
        // 防止重复清理
        if (this._isCleanedUp) {
            return;
        }
        this._isCleanedUp = true;
        
        // 清理各个组件
        const componentsToCleanup = [
            { name: 'statsPanel', component: this.statsPanel },
            { name: 'apiProviderManager', component: this.apiProviderManager },
            { name: 'globalSettingsGroup', component: this.globalSettingsGroup },
            { name: 'aboutGroup', component: this.aboutGroup },
            { name: 'notificationsGroup', component: this.notificationsGroup },
            { name: 'settingsManager', component: this.settingsManager }
        ];
        
        componentsToCleanup.forEach(({ name, component }) => {
            if (component && typeof component.cleanup === 'function') {
                try {
                    component.cleanup();
                } catch (e) {
                    console.error(`Error cleaning up ${name}:`, e);
                }
            }
        });
        
        // 清理引用
        this._settings = null;
        this._window = null;
        this._page = null;
        this._loadingGroup = null;
        this.settingsManager = null;
        this.statsPanel = null;
        this.apiProviderManager = null;
        this.globalSettingsGroup = null;
        this.aboutGroup = null;
        this.notificationsGroup = null;
        this._cleanupConnected = false;
    }
}