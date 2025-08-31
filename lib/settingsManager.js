import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * @class SettingsManager
 * @description Manages synchronization between GSettings and the Claude Code settings.json file.
 */
export class SettingsManager {
    /**
     * @param {Gio.Settings} settings - The GSettings object.
     * @param {Extension} extension - The main extension object.
     */
    constructor(settings, extension) {
        this.settings = settings;
        this.extension = extension;
        this._isDestroyed = false;

        this._migrateNotificationSettings();
    }

    /**
     * Migrates legacy notification settings to the unified 'hook-task-completion'.
     * @private
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
                hasOldSettings =
                    this.settings.get_user_value('hook-normal-exit') !== null;
                if (hasOldSettings) {
                    normalExitEnabled =
                        this.settings.get_boolean('hook-normal-exit');
                }
            } catch (e) {
                // hook-normal-exit 键不存在于schema中，跳过
                console.debug(
                    'hook-normal-exit key not found in schema, skipping migration for this key'
                );
            }

            try {
                const hasAbnormalSetting =
                    this.settings.get_user_value('hook-abnormal-exit') !== null;
                if (hasAbnormalSetting) {
                    hasOldSettings = hasOldSettings || hasAbnormalSetting;
                    abnormalExitEnabled =
                        this.settings.get_boolean('hook-abnormal-exit');
                }
            } catch (e) {
                // hook-abnormal-exit 键不存在于schema中，跳过
                console.debug(
                    'hook-abnormal-exit key not found in schema, skipping migration for this key'
                );
            }

            if (hasOldSettings) {
                // 如果任一选项被启用，则启用新的合并选项
                const taskCompletionEnabled =
                    normalExitEnabled || abnormalExitEnabled;
                this.settings.set_boolean(
                    'hook-task-completion',
                    taskCompletionEnabled
                );

                // 迁移消息设置（同样安全处理）
                let normalExitMessage = '';
                let abnormalExitMessage = '';

                try {
                    normalExitMessage = this.settings.get_string(
                        'normal-exit-message'
                    );
                } catch (e) {
                    console.debug(
                        'normal-exit-message key not found, using default'
                    );
                }

                try {
                    abnormalExitMessage = this.settings.get_string(
                        'abnormal-exit-message'
                    );
                } catch (e) {
                    console.debug(
                        'abnormal-exit-message key not found, using default'
                    );
                }

                // 优先使用normal-exit-message，如果为空则使用abnormal-exit-message
                let taskCompletionMessage = 'Claude Code task completed.';
                if (normalExitMessage && normalExitMessage.trim() !== '') {
                    taskCompletionMessage = normalExitMessage;
                } else if (
                    abnormalExitMessage &&
                    abnormalExitMessage.trim() !== ''
                ) {
                    taskCompletionMessage = abnormalExitMessage;
                }

                this.settings.set_string(
                    'task-completion-message',
                    taskCompletionMessage
                );

                console.log('Migrated notification settings:', {
                    normalExitEnabled,
                    abnormalExitEnabled,
                    taskCompletionEnabled,
                    taskCompletionMessage,
                });

                // 安全地重置旧的设置项为默认值（如果存在的话）
                try {
                    this.settings.reset('hook-normal-exit');
                } catch (e) {
                    console.debug(
                        'hook-normal-exit key not found, cannot reset'
                    );
                }

                try {
                    this.settings.reset('hook-abnormal-exit');
                } catch (e) {
                    console.debug(
                        'hook-abnormal-exit key not found, cannot reset'
                    );
                }

                try {
                    this.settings.reset('normal-exit-message');
                } catch (e) {
                    console.debug(
                        'normal-exit-message key not found, cannot reset'
                    );
                }

                try {
                    this.settings.reset('abnormal-exit-message');
                } catch (e) {
                    console.debug(
                        'abnormal-exit-message key not found, cannot reset'
                    );
                }
            }

            // 标记为已迁移
            this.settings.set_boolean(hasMigratedKey, true);
        } catch (e) {
            console.error('Failed to migrate notification settings:', e);
        }
    }

    /**
     * Gets the path to the Claude settings.json file.
     * @returns {string} - The absolute path to settings.json.
     * @private
     */
    _getClaudeConfigPath() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        return GLib.build_filenamev([claudeDir, 'settings.json']);
    }

    /**
     * Ensures the ~/.claude directory exists.
     * @returns {Promise<boolean>} - True if the directory exists or was created, false on failure.
     * @private
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
                                console.log(
                                    'Created Claude config directory:',
                                    claudeDir
                                );
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
     * Reads and parses the existing settings.json file.
     * @returns {Promise<object|null>} - The parsed configuration object, or null if an error occurs.
     * @private
     */
    async _readExistingConfig() {
        const configPath = this._getClaudeConfigPath();
        const file = Gio.File.new_for_path(configPath);

        try {
            const [contents] = await new Promise((resolve, reject) => {
                file.load_contents_async(null, (source, result) => {
                    try {
                        const [contents, etag] =
                            source.load_contents_finish(result);
                        resolve([contents, etag]);
                    } catch (e) {
                        if (e.code === Gio.IOErrorEnum.NOT_FOUND) {
                            resolve([null, null]);
                        } else {
                            reject(e);
                        }
                    }
                });
            });

            if (contents) {
                try {
                    const decoder = new TextDecoder('utf-8');
                    // Explicitly pass the underlying buffer of the Uint8Array
                    // to ensure compatibility with the TextDecoder API in GJS.
                    const jsonString = decoder.decode(contents.buffer);
                    // Prevent parsing empty strings
                    if (jsonString && jsonString.trim() !== '') {
                        return JSON.parse(jsonString);
                    }
                } catch (e) {
                    console.error(
                        'Failed to parse existing Claude config file, a new one will be created:',
                        e
                    );
                    // Fall through to return null if parsing fails
                }
            }
        } catch (e) {
            console.error('Failed to read Claude config file:', e);
        }

        return null;
    }

    /**
     * Retrieves the full information object for the currently selected provider.
     * @returns {object|null} - The provider object or null if not found.
     * @private
     */
    _getCurrentProviderInfo() {
        try {
            const providersJson = this.settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const currentProviderName =
                this.settings.get_string('current-provider');

            if (!currentProviderName) {
                return null;
            }

            return providers.find((p) => p.name === currentProviderName);
        } catch (e) {
            console.error('Failed to get current provider info:', e);
            return null;
        }
    }

    /**
     * Builds the environment configuration object for settings.json.
     * @param {object} existingEnv - The existing environment config, if any.
     * @param {object} currentProvider - The currently selected API provider object.
     * @returns {object} - The constructed environment object.
     * @private
     */
    _buildEnvironmentConfig(existingEnv, currentProvider) {
        const autoUpdate = this.settings.get_boolean('auto-update');
        const proxyHost = this.settings.get_string('proxy-host');
        const proxyPort = this.settings.get_string('proxy-port');

        let proxyUrl = '';
        if (proxyHost) {
            proxyUrl = proxyPort ? `${proxyHost}:${proxyPort}` : proxyHost;
            if (
                !proxyUrl.startsWith('http://') &&
                !proxyUrl.startsWith('https://')
            ) {
                proxyUrl = `http://${proxyUrl}`;
            }
        }

        const newEnv = existingEnv || {};

        // 基本的提供商设置
        newEnv.ANTHROPIC_AUTH_TOKEN = currentProvider
            ? currentProvider.key
            : '';
        newEnv.ANTHROPIC_BASE_URL = currentProvider ? currentProvider.url : '';
        newEnv.ANTHROPIC_MODEL = currentProvider
            ? currentProvider.largeModel || ''
            : '';
        newEnv.ANTHROPIC_SMALL_FAST_MODEL = currentProvider
            ? currentProvider.smallModel || ''
            : '';

        // 自动更新逻辑
        if (!autoUpdate) {
            newEnv.DISABLE_AUTOUPDATER = '1'; // 禁用自动更新
        } else {
            delete newEnv.DISABLE_AUTOUPDATER; // 启用自动更新（默认行为），移除该键
        }

        // 代理逻辑
        if (proxyUrl) {
            newEnv.HTTPS_PROXY = proxyUrl;
            newEnv.HTTP_PROXY = proxyUrl;
        } else {
            delete newEnv.HTTPS_PROXY; // 无代理设置，移除该键
            delete newEnv.HTTP_PROXY;
        }

        return newEnv;
    }

    /**
     * Removes any hooks managed by this extension from a hooks object.
     * @param {object} existingHooks - The existing hooks configuration.
     * @returns {object} - The cleaned hooks object.
     * @private
     */
    _cleanupAndPrepareHooks(existingHooks) {
        const hooks = existingHooks || {};
        ['Stop', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'Notification'].forEach(
            (eventName) => {
                if (hooks[eventName]) {
                    hooks[eventName] = hooks[eventName].filter(
                        (hookGroup) =>
                            !hookGroup.hooks?.some((h) =>
                                h.command?.includes(this.extension.path)
                            )
                    );
                    if (hooks[eventName].length === 0) {
                        delete hooks[eventName];
                    }
                }
            }
        );
        return hooks;
    }

    /**
     * Adds notification hooks to the configuration based on GSettings.
     * @param {object} hooks - The hooks configuration object to modify.
     * @private
     */
    _applyNotificationHooks(hooks) {
        const notificationsEnabled = this.settings.get_boolean(
            'notifications-enabled'
        );
        const taskCompletionEnabled = this.settings.get_boolean(
            'hook-task-completion'
        );
        const toolAuthEnabled = this.settings.get_boolean('hook-tool-auth');

        if (
            !notificationsEnabled ||
            (!taskCompletionEnabled && !toolAuthEnabled)
        ) {
            return;
        }

        const notificationHandlerCommand = `gjs -m "${this.extension.path}/hooks/dbusNotifier.js"`;

        if (taskCompletionEnabled) {
            const hook = {
                hooks: [
                    {
                        type: 'command',
                        command: `${notificationHandlerCommand} taskCompletion`,
                    },
                ],
            };
            // 只在主任务 'Stop' 事件上触发通知
            const eventName = 'Stop';
            if (!hooks[eventName]) hooks[eventName] = [];
            hooks[eventName].push(hook);
        }

        if (toolAuthEnabled) {
            const hook = {
                hooks: [
                    {
                        type: 'command',
                        command: `${notificationHandlerCommand} toolAuth`,
                    },
                ],
            };
            // 只在 'Notification' 事件上触发通知
            const eventName = 'Notification';
            if (!hooks[eventName]) hooks[eventName] = [];
            hooks[eventName].push(hook);
        }
    }

    /**
     * Generates the Claude configuration object based on current GSettings.
     * @returns {Promise<object>} - The generated configuration object.
     * @private
     */
    async _generateClaudeConfig() {
        const existingConfig = (await this._readExistingConfig()) || {};
        const currentProvider = this._getCurrentProviderInfo();

        const config = {
            env: this._buildEnvironmentConfig(
                existingConfig.env,
                currentProvider
            ),
            permissions: existingConfig.permissions || { allow: [], deny: [] },
        };

        const hooks = this._cleanupAndPrepareHooks(existingConfig.hooks);
        this._applyNotificationHooks(hooks);

        if (Object.keys(hooks).length > 0) {
            config.hooks = hooks;
        }

        // 保留其他未知字段
        Object.keys(existingConfig).forEach((key) => {
            if (
                ![
                    'env',
                    'permissions',
                    'hooks',
                    'feedbackSurveyState',
                ].includes(key)
            ) {
                config[key] = existingConfig[key];
            }
        });

        return config;
    }

    /**
     * Synchronizes the current GSettings to the local Claude settings.json file.
     * @returns {Promise<void>}
     * @throws {Error} - If the operation fails.
     */
    async syncToLocalFile() {
        if (this._checkDestroyed()) {
            throw new Error('Settings manager has been destroyed');
        }

        try {
            const dirReady = await this._ensureClaudeDir();
            if (!dirReady) {
                throw new Error(
                    'Failed to create Claude configuration directory'
                );
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
                            console.log(
                                'Synced config to Claude config file:',
                                configPath
                            );
                            resolve();
                        } catch (e) {
                            console.error(
                                'Failed to write configuration file:',
                                e
                            );
                            reject(
                                new Error(
                                    `Failed to write configuration file: ${e.message}`
                                )
                            );
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
     * Gets the current proxy configuration.
     * @returns {{host: string, port: string}}
     */
    getProxyInfo() {
        const host = this.settings.get_string('proxy-host');
        const port = this.settings.get_string('proxy-port');
        return { host, port };
    }

    /**
     * Sets the proxy configuration and syncs to the file.
     * @param {string} host - The proxy host.
     * @param {string} port - The proxy port.
     * @returns {Promise<void>}
     */
    async setProxy(host, port) {
        this.settings.set_string('proxy-host', host || '');
        this.settings.set_string('proxy-port', port || '');
        await this.syncToLocalFile();
    }

    /**
     * Clears the Claude settings.json file to an empty object.
     * @returns {Promise<boolean>} - True on success, false on failure.
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
                            console.log(
                                'Cleared Claude config file:',
                                configPath
                            );
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
     * Gets the auto-update setting.
     * @returns {boolean}
     */
    getAutoUpdate() {
        return this.settings.get_boolean('auto-update');
    }

    /**
     * Sets the auto-update setting and syncs to the file.
     * @param {boolean} enabled - Whether auto-update should be enabled.
     * @returns {Promise<void>}
     */
    async setAutoUpdate(enabled) {
        this.settings.set_boolean('auto-update', enabled);
        await this.syncToLocalFile();
    }

    /**
     * Gets the current notification settings.
     * @returns {{enabled: boolean, taskCompletion: boolean, toolAuth: boolean}}
     */
    getNotificationSettings() {
        return {
            enabled: this.settings.get_boolean('notifications-enabled'),
            taskCompletion: this.settings.get_boolean('hook-task-completion'),
            toolAuth: this.settings.get_boolean('hook-tool-auth'),
        };
    }

    /**
     * Sets the current provider and syncs to the file.
     * @param {string} providerName - The name of the provider to set as current.
     * @returns {Promise<void>}
     */
    async setCurrentProvider(providerName) {
        this.settings.set_string('current-provider', providerName);
        await this.syncToLocalFile();
    }

    /**
     * Gets all configured API providers.
     * @returns {Array<object>} - An array of provider objects.
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
     * Checks if the manager has been destroyed to prevent operations after cleanup.
     * @returns {boolean}
     * @private
     */
    _checkDestroyed() {
        if (this._isDestroyed) {
            console.warn('SettingsManager has been destroyed');
            return true;
        }
        return false;
    }

    /**
     * Asynchronously cleans up hooks from the local Claude config file.
     * This is designed to be safely called during extension disable.
     * It regenerates the config without this extension's hooks and writes it.
     * @private
     */
    async cleanupLocalFile() {
        if (this._checkDestroyed()) {
            return;
        }

        try {
            const existingConfig = (await this._readExistingConfig()) || {};
            if (!existingConfig.hooks) {
                console.debug('No hooks to clean up.');
                return; // Nothing to clean up
            }

            // Clean the hooks object
            const cleanedHooks = this._cleanupAndPrepareHooks(existingConfig.hooks);

            // If hooks are now empty, remove the object, otherwise assign the cleaned one
            if (Object.keys(cleanedHooks).length === 0) {
                delete existingConfig.hooks;
            } else {
                existingConfig.hooks = cleanedHooks;
            }

            // Write the cleaned configuration back to the file.
            const configPath = this._getClaudeConfigPath();
            const jsonString = JSON.stringify(existingConfig, null, 2);
            const file = Gio.File.new_for_path(configPath);
            const bytes = new TextEncoder().encode(jsonString);

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
                            console.log(
                                'Successfully cleaned up hooks from Claude config file on disable.'
                            );
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        } catch (e) {
            console.error(
                'Error during asynchronous cleanup of Claude config file:',
                e
            );
        }
    }

    /**
     * Cleans up resources, such as settings references.
     */
    cleanup() {
        if (this._isDestroyed) {
            return;
        }
        this.settings = null;
        this.extension = null;
        this._isDestroyed = true;
    }
}
