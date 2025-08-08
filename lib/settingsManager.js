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
     * 生成标准的Claude配置对象
     */
    _generateClaudeConfig() {
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
     * 同步配置到本地Claude配置文件
     */
    syncToLocalFile() {
        if (this._checkDestroyed()) {
            return;
        }
        
        if (!this._ensureClaudeDir()) {
            return;
        }
        
        const configPath = this._getClaudeConfigPath();
        const config = this._generateClaudeConfig();
        
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
     * 获取代理配置信息
     */
    getProxyInfo() {
        const host = this.settings.get_string('proxy-host');
        const port = this.settings.get_string('proxy-port');
        return { host, port };
    }

    /**
     * 设置代理配置
     */
    setProxy(host, port) {
        this.settings.set_string('proxy-host', host || '');
        this.settings.set_string('proxy-port', port || '');
        this.syncToLocalFile();
    }

    /**
     * 获取自动更新设置
     */
    getAutoUpdate() {
        return this.settings.get_boolean('auto-update');
    }

    /**
     * 设置自动更新
     */
    setAutoUpdate(enabled) {
        this.settings.set_boolean('auto-update', enabled);
        this.syncToLocalFile();
    }

    /**
     * 获取通知设置
     */
    getNotificationSettings() {
        return {
            enabled: this.settings.get_boolean('notifications-enabled'),
            normalExit: this.settings.get_boolean('hook-normal-exit'),
            abnormalExit: this.settings.get_boolean('hook-abnormal-exit')
        };
    }

    /**
     * 设置当前提供商
     */
    setCurrentProvider(providerName) {
        this.settings.set_string('current-provider', providerName);
        this.syncToLocalFile();
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