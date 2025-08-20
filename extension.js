/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ClaudeHookInterface} from './lib/claudeHookInterface.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('Claude Code Switcher'));
        this._extension = extension;
        this._settings = extension.getSettings();
        this._signalIds = [];

        this.add_child(new St.Icon({
            icon_name: 'face-smile-symbolic',
            style_class: 'system-status-icon',
        }));

        // 构建菜单
        this._buildMenu();

        // 监听设置变化 - 使用数组管理信号连接
        this._signalIds.push(
            this._settings.connect('changed::api-providers', () => {
                this._rebuildMenu();
            })
        );
        this._signalIds.push(
            this._settings.connect('changed::current-provider', () => {
                this._updateCurrentProvider();
            })
        );
    }

    _buildMenu() {
        // 清空现有菜单
        this.menu.removeAll();

        // 添加API提供商列表
        this._addProviderMenuItems();

        // 添加分隔符
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 添加"Add more.."按钮
        let addMoreItem = new PopupMenu.PopupMenuItem(_('Add more..'));
        addMoreItem.connect('activate', () => {
            this._openPreferences();
        });
        this.menu.addMenuItem(addMoreItem);
    }

    _addProviderMenuItems() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            if (!providersJson || providersJson.trim() === '') {
                this._addNoProvidersItem();
                return;
            }

            const providers = JSON.parse(providersJson);
            const currentProvider = this._settings.get_string('current-provider');

            if (!Array.isArray(providers) || providers.length === 0) {
                this._addNoProvidersItem();
                return;
            }

            // 为每个提供商创建菜单项
            providers.forEach((provider, index) => {
                try {
                    if (!provider || typeof provider.name !== 'string') {
                        console.warn(`Invalid provider at index ${index}:`, provider);
                        return;
                    }

                    let item = new PopupMenu.PopupMenuItem(provider.name);
                    
                    // 如果是当前选中的提供商，添加勾选标记
                    if (provider.name === currentProvider) {
                        item.setOrnament(PopupMenu.Ornament.CHECK);
                    }

                    item.connect('activate', () => {
                        this._selectProvider(provider.name);
                    });

                    this.menu.addMenuItem(item);
                } catch (itemError) {
                    console.error(`Error creating menu item for provider ${provider?.name || 'unknown'}:`, itemError);
                }
            });
        } catch (e) {
            console.error('Failed to load API providers:', e);
            this._addErrorItem(_('Failed to load providers'));
        }
    }
    
    /**
     * 添加无提供商提示项
     */
    _addNoProvidersItem() {
        let noProvidersItem = new PopupMenu.PopupMenuItem(_('No configured providers'));
        noProvidersItem.setSensitive(false);
        this.menu.addMenuItem(noProvidersItem);
    }
    
    /**
     * 添加错误提示项
     */
    _addErrorItem(message) {
        let errorItem = new PopupMenu.PopupMenuItem(message);
        errorItem.setSensitive(false);
        this.menu.addMenuItem(errorItem);
    }

    _selectProvider(providerName) {
        try {
            // 检查提供商是否有API密钥
            if (this._checkProviderKey(providerName)) {
                this._settings.set_string('current-provider', providerName);
                // 同步配置到本地文件 (异步调用，包含错误处理)
                this._extension.syncToLocalFile().catch(e => {
                    console.error('Error syncing to local file:', e);
                    // 显示用户友好的错误消息
                    Main.notify(_('Configuration Error'), 
                        _('Failed to save configuration. Please check extension settings.'));
                });
                Main.notify(_('Switched to: ') + providerName);
            } else {
                // 显示配置API密钥的提示
                this._showConfigureKeyNotification(providerName);
            }
        } catch (e) {
            console.error('Error selecting provider:', e);
            Main.notify(_('Error switching provider'), _('Please check the extension settings'));
        }
    }

    _checkProviderKey(providerName) {
        try {
            if (!providerName || typeof providerName !== 'string') {
                console.warn('Invalid provider name:', providerName);
                return false;
            }

            const providersJson = this._settings.get_string('api-providers');
            if (!providersJson || providersJson.trim() === '') {
                console.warn('No providers configuration found');
                return false;
            }

            const providers = JSON.parse(providersJson);
            if (!Array.isArray(providers)) {
                console.warn('Invalid providers format - not an array');
                return false;
            }
            
            const provider = providers.find(p => p && p.name === providerName);
            if (!provider) {
                console.warn(`Provider '${providerName}' not found`);
                return false;
            }

            const hasValidKey = provider.key && typeof provider.key === 'string' && provider.key.trim() !== '';
            if (!hasValidKey) {
                console.info(`Provider '${providerName}' has no valid API key`);
            }

            return hasValidKey;
        } catch (e) {
            console.error('Failed to check API key for provider:', providerName, e);
            return false;
        }
    }

    _showConfigureKeyNotification(providerName) {
        if (providerName.includes('Anthropic') || providerName.includes('默认')) {
            Main.notify(_('Please configure Anthropic API key first'), _('Click "Add more.." button to open settings and configure the official API key for Anthropic provider.'));
        } else {
            Main.notify(_('Please configure API key for ') + providerName + _(' first'), _('Click "Add more.." button to open settings and configure the API key for this provider.'));
        }
    }

    _rebuildMenu() {
        this._buildMenu();
    }

    _updateCurrentProvider() {
        // 重新构建菜单以更新勾选状态
        this._rebuildMenu();
    }

    _openPreferences() {
        if (this._extension && this._extension.openPreferences) {
            this._extension.openPreferences();
        }
    }
    
    /**
     * 清理资源 - 符合GJS最佳实践
     */
    destroy() {
        // 断开信号连接
        if (this._signalIds && this._settings) {
            this._signalIds.forEach(id => {
                try {
                    this._settings.disconnect(id);
                } catch (e) {
                    console.error('Error disconnecting signal:', e);
                }
            });
            this._signalIds = null;
        }
        
        // 清理引用
        this._extension = null;
        this._settings = null;
        
        // 调用父类的destroy方法
        super.destroy();
    }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        // Initialize Claude Code Hook Interface
        this._claudeHookInterface = new ClaudeHookInterface(this);
        // 异步初始化，但不阻塞enable()
        this._claudeHookInterface.initialize().catch(e => {
            console.error('Failed to initialize Claude Hook Interface:', e);
        });
        
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        
        // 监听设置变化，同步到本地文件
        this._settings = this.getSettings();
        this._settingsChangedIds = [];
        
        // 优化：使用单个处理函数和批量监听
        const settingsToWatch = [
            'current-provider',
            'auto-update',
            'proxy-host',
            'proxy-port',
            'notifications-enabled',
            'hook-task-completion',
            'hook-notification'
        ];
        
        // 使用GLib.idle_add来防抖，避免频繁同步
        this._syncTimeoutId = null;
        const debouncedSync = () => {
            if (this._syncTimeoutId) {
                GLib.source_remove(this._syncTimeoutId);
            }
            this._syncTimeoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                // 使用异步方式调用，但不在GLib.idle_add中等待
                this.syncToLocalFile().catch(e => {
                    console.error('Error syncing to local file:', e);
                });
                this._syncTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        };
        
        // 批量添加监听器
        settingsToWatch.forEach(setting => {
            this._settingsChangedIds.push(
                this._settings.connect(`changed::${setting}`, debouncedSync)
            );
        });
        
        // 初始化时异步同步一次
        this.syncToLocalFile().catch(e => {
            console.error('Initial sync failed:', e);
        });
    }

    disable() {
        // Cleanup Claude Code Hook Interface
        if (this._claudeHookInterface) {
            try {
                this._claudeHookInterface.destroy();
            } catch (e) {
                console.error('Error destroying Claude Hook Interface:', e);
            }
            this._claudeHookInterface = null;
        }
        
        // 清理同步超时
        if (this._syncTimeoutId) {
            GLib.source_remove(this._syncTimeoutId);
            this._syncTimeoutId = null;
        }
        
        // 断开设置监听
        if (this._settingsChangedIds && this._settings) {
            this._settingsChangedIds.forEach(id => {
                try {
                    this._settings.disconnect(id);
                } catch (e) {
                    console.error('Error disconnecting settings signal:', e);
                }
            });
            this._settingsChangedIds = null;
        }
        
        // 清理指示器
        if (this._indicator) {
            try {
                this._indicator.destroy();
            } catch (e) {
                console.error('Error destroying indicator:', e);
            }
            this._indicator = null;
        }
        
        this._settings = null;
    }
    
    handleClaudeExit(exitCode) {
        const currentProvider = this._getCurrentProviderInfo();
        const providerName = currentProvider ? currentProvider.name : 'Unknown';
        
        if (this._hookInterface) {
            this._hookInterface.onExit(exitCode, providerName);
        }
        
        return exitCode;
    }
    
    getHookInterface() {
        return this._hookInterface;
    }
    
    /**
     * 安装Claude Code hooks
     */
    installHooks() {
        if (this._claudeHook && this._claudeHook.isHookSupported()) {
            const success = this._claudeHook.installExitCodeHook();
            if (success) {
                console.log('Claude Code hooks installed successfully');
            }
        }
    }
    
    /**
     * 获取Claude Hook接口状态
     */
    getHookStatus() {
        return this._claudeHook ? this._claudeHook.getStatus() : null;
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
     * 确保Claude配置目录存在 (异步版本)
     */
    async _ensureClaudeDir() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        const dir = Gio.File.new_for_path(claudeDir);
        
        try {
            // 使用异步方式检查目录是否存在
            const exists = await new Promise((resolve, reject) => {
                dir.query_info_async(
                    'standard::type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (source, result) => {
                        try {
                            source.query_info_finish(result);
                            resolve(true);
                        } catch (e) {
                            if (e.code === Gio.IOErrorEnum.NOT_FOUND) {
                                resolve(false);
                            } else {
                                reject(e);
                            }
                        }
                    }
                );
            });
            
            if (!exists) {
                await new Promise((resolve, reject) => {
                    dir.make_directory_async(
                        GLib.PRIORITY_DEFAULT,
                        null,
                        (source, result) => {
                            try {
                                source.make_directory_finish(result);
                                console.log('Created Claude config directory:', claudeDir);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            }
            return true;
        } catch (e) {
            console.error('Failed to create Claude config directory:', e);
            return false;
        }
    }
    
    /**
     * 读取现有的settings.json文件 (异步版本)
     */
    async _readExistingConfig() {
        const configPath = this._getClaudeConfigPath();
        const file = Gio.File.new_for_path(configPath);
        
        try {
            const [contents] = await new Promise((resolve, reject) => {
                file.load_contents_async(
                    null,
                    (source, result) => {
                        try {
                            const [contents, etag] = source.load_contents_finish(result);
                            resolve([contents, etag]);
                        } catch (e) {
                            if (e.code === Gio.IOErrorEnum.NOT_FOUND) {
                                resolve([null, null]);
                            } else {
                                reject(e);
                            }
                        }
                    }
                );
            });
            
            if (contents) {
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
    _getCurrentProviderInfo() {
        try {
            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProviderName = this._settings.get_string('current-provider');
            
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
     * 生成标准的Claude配置对象 (异步优化版本)
     */
    async _generateClaudeConfig() {
        const currentProvider = this._getCurrentProviderInfo();
        const autoUpdate = this._settings.get_boolean('auto-update');
        const proxyHost = this._settings.get_string('proxy-host');
        const proxyPort = this._settings.get_string('proxy-port');
        
        // 获取通知设置
        const notificationsEnabled = this._settings.get_boolean('notifications-enabled');
        const taskCompletionEnabled = this._settings.get_boolean('hook-task-completion');
        const notificationHookEnabled = this._settings.get_boolean('hook-notification');
        
        // 构建代理URL
        let proxyUrl = '';
        if (proxyHost) {
            proxyUrl = proxyPort ? `${proxyHost}:${proxyPort}` : proxyHost;
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                proxyUrl = `http://${proxyUrl}`;
            }
        }
        
        // 读取现有配置以保留其他字段（包括自定义hooks）
        const existingConfig = await this._readExistingConfig() || {};
        
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
            }
        };
        
        // 根据通知设置管理hooks
        // notificationsEnabled 已在第354行声明
        
        // 先保留现有的hooks配置
        if (existingConfig.hooks) {
            config.hooks = existingConfig.hooks;
        } else {
            config.hooks = {};
        }
        
        // 根据具体的通知设置来添加hooks
        if (notificationsEnabled && (taskCompletionEnabled || notificationHookEnabled)) {
            const ourHooks = {};
            const notificationCommand = `gjs -m "${this.path}/hooks/notificationHandler.js"`;
            
            // 任务完成通知：使用Stop hook（在任务完成时触发）
            if (taskCompletionEnabled) {
                ourHooks['Stop'] = [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": notificationCommand
                            }
                        ]
                    }
                ];
            }
            
            // 添加Notification hook来处理Claude Code通知事件
            if (notificationHookEnabled) {
                ourHooks['Notification'] = [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": notificationCommand
                            }
                        ]
                    }
                ];
            }
            
            // 先清理所有扩展相关的hooks
            ['Stop', 'Notification'].forEach(eventName => {
                if (config.hooks[eventName]) {
                    config.hooks[eventName] = config.hooks[eventName].filter(hookGroup => {
                        if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
                            return !hookGroup.hooks.some(h =>
                                h.command && (
                                    h.command.includes('Claude Code Switcher') ||
                                    h.command.includes('hooks/notificationHandler.js') ||
                                    h.command.includes('hooks/processMonitor.js') ||
                                    h.command.includes('ui/notificationHandler.js') ||
                                    h.command.includes('ui/processMonitor.js')
                                )
                            );
                        }
                        return true;
                    });
                    
                    // 如果清理后为空，删除该事件
                    if (config.hooks[eventName].length === 0) {
                        delete config.hooks[eventName];
                    }
                }
            });
            
            // 然后添加新的hooks
            Object.keys(ourHooks).forEach(eventName => {
                if (!config.hooks[eventName]) {
                    config.hooks[eventName] = ourHooks[eventName];
                } else {
                    config.hooks[eventName].push(...ourHooks[eventName]);
                }
            });
        } else {
            // 移除我们的hooks但保留用户自定义的
            ['Stop', 'Notification'].forEach(eventName => {
                if (config.hooks[eventName]) {
                    config.hooks[eventName] = config.hooks[eventName].filter(hookGroup => {
                        if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
                            return !hookGroup.hooks.some(h =>
                                h.command && (
                                    h.command.includes('Claude Code Switcher') ||
                                    h.command.includes('hooks/notificationHandler.js') ||
                                    h.command.includes('hooks/processMonitor.js') ||
                                    h.command.includes('ui/notificationHandler.js') ||
                                    h.command.includes('ui/processMonitor.js')
                                )
                            );
                        }
                        return true;
                    });
                    
                    if (config.hooks[eventName].length === 0) {
                        delete config.hooks[eventName];
                    }
                }
            });
            
            if (Object.keys(config.hooks).length === 0) {
                delete config.hooks;
            }
        }
        
        // 保留其他未知的配置字段，但排除Claude Code内部字段
        Object.keys(existingConfig).forEach(key => {
            if (!['env', 'permissions', 'hooks', 'feedbackSurveyState'].includes(key)) {
                config[key] = existingConfig[key];
            }
        });
        
        return config;
    }
    
    /**
     * 同步配置到本地Claude配置文件 (异步优化版本)
     */
    async syncToLocalFile() {
        try {
            const dirReady = await this._ensureClaudeDir();
            if (!dirReady) {
                console.error('Failed to create Claude configuration directory');
                throw new Error(_('Cannot create Claude configuration directory'));
            }
            
            const configPath = this._getClaudeConfigPath();
            const config = await this._generateClaudeConfig();
            
            const jsonString = JSON.stringify(config, null, 2);
            const file = Gio.File.new_for_path(configPath);
            
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonString);
            
            await new Promise((resolve, reject) => {
                file.replace_contents_async(
                    bytes,
                    null, // etag
                    false, // make_backup
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null, // cancellable
                    (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            console.log('Synced config to Claude config file:', configPath);
                            resolve();
                        } catch (e) {
                            console.error('Failed to write configuration file:', e);
                            reject(new Error(_('Failed to save configuration file')));
                        }
                    }
                );
            });
        } catch (e) {
            console.error('Failed to sync configuration:', e);
            throw e; // 重新抛出错误，让调用者处理
        }
    }
}
