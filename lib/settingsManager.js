import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * 设置管理器
 * 负责处理Claude配置文件的同步和管理
 */
export class SettingsManager {
    constructor(settings) {
        this.settings = settings;
        this._signalIds = [];
        this._isDestroyed = false;
        
        // 执行设置迁移
        this._migrateNotificationSettings();
    }
    
    /**
     * 迁移通知设置从分离的选项到合并的选项
     * 将 hook-normal-exit 和 hook-abnormal-exit 合并为 hook-task-completion
     */
    _migrateNotificationSettings() {
        try {
            // 检查是否已经迁移过
            const hasMigratedKey = 'notification-settings-migrated';
            const migrated = this.settings.get_boolean(hasMigratedKey);
            
            if (migrated) {
                return; // 已经迁移过，跳过
            }
            
            // 安全地检查是否存在旧的设置项
            let hasOldSettings = false;
            let normalExitEnabled = false;
            let abnormalExitEnabled = false;
            
            try {
                hasOldSettings = this.settings.get_user_value('hook-normal-exit') !== null;
                if (hasOldSettings) {
                    normalExitEnabled = this.settings.get_boolean('hook-normal-exit');
                }
            } catch (e) {
                // hook-normal-exit 键不存在于schema中，跳过
                console.debug('hook-normal-exit key not found in schema, skipping migration for this key');
            }
            
            try {
                const hasAbnormalSetting = this.settings.get_user_value('hook-abnormal-exit') !== null;
                if (hasAbnormalSetting) {
                    hasOldSettings = hasOldSettings || hasAbnormalSetting;
                    abnormalExitEnabled = this.settings.get_boolean('hook-abnormal-exit');
                }
            } catch (e) {
                // hook-abnormal-exit 键不存在于schema中，跳过
                console.debug('hook-abnormal-exit key not found in schema, skipping migration for this key');
            }
            
            if (hasOldSettings) {
                // 如果任一选项被启用，则启用新的合并选项
                const taskCompletionEnabled = normalExitEnabled || abnormalExitEnabled;
                this.settings.set_boolean('hook-task-completion', taskCompletionEnabled);
                
                // 迁移消息设置（同样安全处理）
                let normalExitMessage = '';
                let abnormalExitMessage = '';
                
                try {
                    normalExitMessage = this.settings.get_string('normal-exit-message');
                } catch (e) {
                    console.debug('normal-exit-message key not found, using default');
                }
                
                try {
                    abnormalExitMessage = this.settings.get_string('abnormal-exit-message');
                } catch (e) {
                    console.debug('abnormal-exit-message key not found, using default');
                }
                
                // 优先使用normal-exit-message，如果为空则使用abnormal-exit-message
                let taskCompletionMessage = 'Claude Code task completed.';
                if (normalExitMessage && normalExitMessage.trim() !== '') {
                    taskCompletionMessage = normalExitMessage;
                } else if (abnormalExitMessage && abnormalExitMessage.trim() !== '') {
                    taskCompletionMessage = abnormalExitMessage;
                }
                
                this.settings.set_string('task-completion-message', taskCompletionMessage);
                
                console.log('Migrated notification settings:', {
                    normalExitEnabled,
                    abnormalExitEnabled,
                    taskCompletionEnabled,
                    taskCompletionMessage
                });
                
                // 安全地重置旧的设置项为默认值（如果存在的话）
                try {
                    this.settings.reset('hook-normal-exit');
                } catch (e) {
                    console.debug('hook-normal-exit key not found, cannot reset');
                }
                
                try {
                    this.settings.reset('hook-abnormal-exit');
                } catch (e) {
                    console.debug('hook-abnormal-exit key not found, cannot reset');
                }
                
                try {
                    this.settings.reset('normal-exit-message');
                } catch (e) {
                    console.debug('normal-exit-message key not found, cannot reset');
                }
                
                try {
                    this.settings.reset('abnormal-exit-message');
                } catch (e) {
                    console.debug('abnormal-exit-message key not found, cannot reset');
                }
            }
            
            // 标记为已迁移
            this.settings.set_boolean(hasMigratedKey, true);
            
        } catch (e) {
            console.error('Failed to migrate notification settings:', e);
        }
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
            const providersJson = this.settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProviderName = this.settings.get_string('current-provider');
            
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
     * 生成标准的Claude配置对象 (异步版本)
     */
    async _generateClaudeConfig() {
        const currentProvider = this._getCurrentProviderInfo();
        const autoUpdate = this.settings.get_boolean('auto-update');
        const proxyHost = this.settings.get_string('proxy-host');
        const proxyPort = this.settings.get_string('proxy-port');
        
        // 构建代理URL
        let proxyUrl = '';
        if (proxyHost) {
            proxyUrl = proxyPort ? `${proxyHost}:${proxyPort}` : proxyHost;
            if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
                proxyUrl = `http://${proxyUrl}`;
            }
        }
        
        // 读取现有配置以保留其他字段
        const existingConfig = await this._readExistingConfig() || {};
        
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
            }
        };
        
        // 只有当现有配置中存在feedbackSurveyState时才保留它
        // 不要自动创建这个配置，因为它是Claude Code内部使用的
        if (existingConfig.feedbackSurveyState) {
            config.feedbackSurveyState = existingConfig.feedbackSurveyState;
        }
        
        return config;
    }
    
    /**
     * 同步配置到本地Claude配置文件 (异步版本)
     */
    async syncToLocalFile() {
        if (this._checkDestroyed()) {
            throw new Error('Settings manager has been destroyed');
        }
        
        try {
            const dirReady = await this._ensureClaudeDir();
            if (!dirReady) {
                throw new Error('Failed to create Claude configuration directory');
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
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
                    (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            console.log('Synced config to Claude config file:', configPath);
                            resolve();
                        } catch (e) {
                            console.error('Failed to write configuration file:', e);
                            reject(new Error(`Failed to write configuration file: ${e.message}`));
                        }
                    }
                );
            });
        } catch (e) {
            console.error('Failed to sync configuration:', e);
            throw e; // 重新抛出，让调用者处理
        }
    }

    /**
     * 获取代理配置信息
     */
    getProxyInfo() {
        const host = this.settings.get_string('proxy-host');
        const port = this.settings.get_string('proxy-port');
        return { host, port };
    }

    /**
     * 设置代理配置 (异步版本)
     */
    async setProxy(host, port) {
        this.settings.set_string('proxy-host', host || '');
        this.settings.set_string('proxy-port', port || '');
        await this.syncToLocalFile();
    }

    /**
     * 清空Claude配置文件，只保留空的JSON对象 (异步版本)
     */
    async clearClaudeConfig() {
        if (this._checkDestroyed()) {
            return false;
        }
        
        try {
            const dirReady = await this._ensureClaudeDir();
            if (!dirReady) {
                return false;
            }
            
            const configPath = this._getClaudeConfigPath();
            const emptyConfig = {};
            const jsonString = JSON.stringify(emptyConfig, null, 2);
            const file = Gio.File.new_for_path(configPath);
            
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonString);
            
            await new Promise((resolve, reject) => {
                file.replace_contents_async(
                    bytes,
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
                    (source, result) => {
                        try {
                            source.replace_contents_finish(result);
                            console.log('Cleared Claude config file:', configPath);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
            return true;
        } catch (e) {
            console.error('Failed to clear Claude config file:', e);
            return false;
        }
    }

    /**
     * 获取自动更新设置
     */
    getAutoUpdate() {
        return this.settings.get_boolean('auto-update');
    }

    /**
     * 设置自动更新 (异步版本)
     */
    async setAutoUpdate(enabled) {
        this.settings.set_boolean('auto-update', enabled);
        await this.syncToLocalFile();
    }

    /**
     * 获取通知设置
     */
    getNotificationSettings() {
        return {
            enabled: this.settings.get_boolean('notifications-enabled'),
            taskCompletion: this.settings.get_boolean('hook-task-completion'),
            notification: this.settings.get_boolean('hook-notification')
        };
    }

    /**
     * 设置当前提供商 (异步版本)
     */
    async setCurrentProvider(providerName) {
        this.settings.set_string('current-provider', providerName);
        await this.syncToLocalFile();
    }

    /**
     * 获取所有提供商
     */
    getAllProviders() {
        try {
            const providersJson = this.settings.get_string('api-providers');
            return JSON.parse(providersJson);
        } catch (e) {
            return [];
        }
    }
    
    /**
     * 检查是否已销毁
     */
    _checkDestroyed() {
        if (this._isDestroyed) {
            console.warn('SettingsManager has been destroyed');
            return true;
        }
        return false;
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        if (this._isDestroyed) {
            return;
        }
        
        // 断开信号连接
        if (this._signalIds && this.settings) {
            this._signalIds.forEach(id => {
                try {
                    this.settings.disconnect(id);
                } catch (e) {
                    console.error('Error disconnecting settings signal:', e);
                }
            });
            this._signalIds = null;
        }
        
        // 清理引用
        this.settings = null;
        this._isDestroyed = true;
    }
}