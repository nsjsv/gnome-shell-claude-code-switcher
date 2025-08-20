/* claudeHookInterface.js
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

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Claude Code Hook Interface
 * Provides a JavaScript-based interface for Claude Code hooks
 * Uses Claude settings.json to create hook configurations
 */
export class ClaudeHookInterface {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._isEnabled = false;
        this._signalIds = [];
        this._initialize();
    }

    /**
     * Initialize hook interface
     */
    _initialize() {
        try {
            this._setupHookConfig();
            this._connectSignals();
            this._isEnabled = true;
            console.log('Claude Hook Interface initialized');
        } catch (e) {
            console.error('Failed to initialize Claude Hook Interface:', e);
        }
    }
    
    /**
     * 连接设置信号监听
     */
    _connectSignals() {
        if (this._settings) {
            this._signalIds.push(
                this._settings.connect('changed::notifications-enabled', () => {
                    this._onNotificationSettingsChanged();
                }),
                this._settings.connect('changed::hook-task-completion', () => {
                    this._onNotificationSettingsChanged();
                }),
                this._settings.connect('changed::hook-notification', () => {
                    this._onNotificationSettingsChanged();
                })
            );
        }
    }
    
    /**
     * 通知设置变化处理
     */
    _onNotificationSettingsChanged() {
        try {
            this._setupHookConfig();
        } catch (e) {
            console.error('Error updating hook config on settings change:', e);
        }
    }

    /**
     * Setup hook configuration in Claude settings
     */
    _setupHookConfig() {
        this._installHookConfig();
    }

    /**
     * Install hook configuration to Claude settings
     * Uses official Claude Code hooks format
     * Preserves existing configurations including custom hooks
     */
    _installHookConfig() {
        try {
            console.log('Installing hook config...');
            const homeDir = GLib.get_home_dir();
            const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
            const settingsFile = GLib.build_filenamev([claudeDir, 'settings.json']);

            // Ensure Claude directory exists
            const claudeDirFile = Gio.File.new_for_path(claudeDir);
            if (!claudeDirFile.query_exists(null)) {
                claudeDirFile.make_directory_with_parents(null);
            }

            // Read existing settings or create new ones
            let settings = {};
            const file = Gio.File.new_for_path(settingsFile);
            
            if (file.query_exists(null)) {
                try {
                    const [, contents] = file.load_contents(null);
                    const decoder = new TextDecoder('utf-8');
                    const jsonString = decoder.decode(contents);
                    settings = JSON.parse(jsonString);
                } catch (e) {
                    console.log('Could not read existing settings, creating new ones');
                }
            }

            // Preserve existing hooks configuration
            if (!settings.hooks) {
                settings.hooks = {};
            }
            
            // Get notification settings from extension
            const notificationsEnabled = this._settings.get_boolean('notifications-enabled');
            const taskCompletionEnabled = this._settings.get_boolean('hook-task-completion');
            const notificationHookEnabled = this._settings.get_boolean('hook-notification');
            
            console.log(`Notifications enabled: ${notificationsEnabled}`);
            console.log(`Task completion notifications: ${taskCompletionEnabled}`);
            console.log(`Notification hooks: ${notificationHookEnabled}`);

            // Configure hooks based on individual notification settings
            if (notificationsEnabled) {
                console.log('Adding Claude Code Switcher hooks based on individual settings...');
                
                // Only add Stop hooks if task completion notifications are enabled
                if (taskCompletionEnabled) {
                    console.log('Adding Stop hooks for task completion notifications...');
                    const stopHooks = this._createStopHooks();
                    this._mergeHooksForEvent(settings, 'Stop', stopHooks);
                }
                
                // Only add Notification hooks if notification hooks are enabled
                if (notificationHookEnabled) {
                    console.log('Adding Notification hooks for tool authorization...');
                    const notificationHooks = this._createNotificationHooks();
                    this._mergeHooksForEvent(settings, 'Notification', notificationHooks);
                }
            } else {
                // When notifications are disabled entirely, remove all our hooks
                // But preserve other hooks that don't belong to us
                this._removeOurHooksFromSettings(settings);
            }
            
            // Also remove specific hooks when their individual settings are disabled
            if (notificationsEnabled) {
                if (!taskCompletionEnabled) {
                    console.log('Removing Stop hooks (task completion disabled)...');
                    this._removeOurHooksForEvent(settings, 'Stop');
                }
                
                if (!notificationHookEnabled) {
                    console.log('Removing Notification hooks (notification hooks disabled)...');
                    this._removeOurHooksForEvent(settings, 'Notification');
                }
            }

            // Write updated settings
            console.log('Final settings to write:', JSON.stringify(settings, null, 2));
            const jsonString = JSON.stringify(settings, null, 2);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(jsonString);
            
            file.replace_contents(
                bytes,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            console.log('Claude hook configuration installed/updated');
            return true;
        } catch (e) {
            console.error('Failed to install hook configuration:', e);
            return false;
        }
    }

    /**
     * Remove all our hooks from settings
     * @param {Object} settings - Settings object
     */
    _removeOurHooksFromSettings(settings) {
        const eventNames = ['Stop', 'Notification'];
        eventNames.forEach(eventName => {
            this._removeOurHooksForEvent(settings, eventName);
        });
    }

    /**
     * Remove our hooks for a specific event
     * @param {Object} settings - Settings object
     * @param {string} eventName - Event name (Stop, Notification, etc.)
     */
    _removeOurHooksForEvent(settings, eventName) {
        if (settings.hooks && settings.hooks[eventName]) {
            // Filter out our hooks (identified by "gjs -m" and extension path in command)
            settings.hooks[eventName] = settings.hooks[eventName].filter(hook => {
                if (hook.hooks && Array.isArray(hook.hooks)) {
                    return !hook.hooks.some(h => 
                        h.command && (
                            h.command.includes('gjs -m') && (
                                h.command.includes('notificationHandler.js') ||
                                h.command.includes('processMonitor.js')
                            )
                        )
                    );
                }
                return true;
            });
            
            // Remove the event entirely if no hooks remain
            if (settings.hooks[eventName].length === 0) {
                delete settings.hooks[eventName];
            }
        }
    }

    /**
     * Merge hooks for a specific event, avoiding duplicates
     * @param {Object} settings - Settings object
     * @param {string} eventName - Event name (Stop, Notification, etc.)
     * @param {Array} newHooks - New hooks to merge
     */
    _mergeHooksForEvent(settings, eventName, newHooks) {
        if (!settings.hooks[eventName]) {
            settings.hooks[eventName] = newHooks;
        } else {
            // Preserve existing hooks and add ours
            // Check if our hooks already exist to avoid duplicates
            const existingHooks = settings.hooks[eventName];
            
            // Simple merge - add our hooks if they don't exist
            newHooks.forEach(newHook => {
                const exists = existingHooks.some(existing => 
                    JSON.stringify(existing.matcher) === JSON.stringify(newHook.matcher) &&
                    JSON.stringify(existing.hooks) === JSON.stringify(newHook.hooks)
                );
                
                if (!exists) {
                    existingHooks.push(newHook);
                }
            });
            
            settings.hooks[eventName] = existingHooks;
        }
    }

    /**
     * Create Stop hook configuration (官方格式)
     */
    _createStopHooks() {
        const hookScriptPath = GLib.build_filenamev([this._extension.path, 'hooks', 'notificationHandler.js']);
        return [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": `gjs -m "${hookScriptPath}"`
                    }
                ]
            }
        ];
    }

    /**
     * Create Notification hook configuration (官方格式)
     */
    _createNotificationHooks() {
        const hookScriptPath = GLib.build_filenamev([this._extension.path, 'hooks', 'notificationHandler.js']);
        return [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": `gjs -m "${hookScriptPath}"`
                    }
                ]
            }
        ];
    }

    /**
     * Check provider configuration status
     * Returns exit code based on configuration state
     */
    checkProviderStatus() {
        try {
            const currentProvider = this._settings.get_string('current-provider');
            if (!currentProvider || currentProvider === 'null') {
                return 1; // No provider configured
            }

            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const provider = providers.find(p => p.name === currentProvider);
            
            if (!provider || !provider.key || provider.key.trim() === '') {
                return 2; // Provider configured but missing API key
            }

            return 0; // Provider configured successfully
        } catch (e) {
            console.error('Error checking provider status:', e);
            return 3; // Unknown error
        }
    }

    /**
     * Get hook interface status
     */
    getStatus() {
        return {
            enabled: this._isEnabled,
            hookConfigInstalled: this._isHookConfigInstalled(),
            providerStatus: this.checkProviderStatus()
        };
    }

    /**
     * Check if hook configuration is installed
     */
    _isHookConfigInstalled() {
        try {
            const homeDir = GLib.get_home_dir();
            const settingsFile = GLib.build_filenamev([homeDir, '.claude', 'settings.json']);
            const file = Gio.File.new_for_path(settingsFile);
            
            if (!file.query_exists(null)) {
                return false;
            }

            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const settings = JSON.parse(jsonString);
            
            // Check for official hook events
            return settings.hooks && (
                settings.hooks['Stop'] || 
                settings.hooks['Notification']
            );
        } catch (e) {
            return false;
        }
    }

    /**
     * Remove hook configuration
     * Only removes our hooks, preserves custom hooks
     */
    uninstallHookConfig() {
        try {
            const homeDir = GLib.get_home_dir();
            const settingsFile = GLib.build_filenamev([homeDir, '.claude', 'settings.json']);
            const file = Gio.File.new_for_path(settingsFile);
            
            if (!file.query_exists(null)) {
                return true;
            }

            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(contents);
            const settings = JSON.parse(jsonString);
            
            // Only remove our specific hooks, not all hooks
            if (settings.hooks) {
                this._removeOurHooksFromSettings(settings);
                
                // Remove hooks object if empty
                if (Object.keys(settings.hooks).length === 0) {
                    delete settings.hooks;
                }
            }

            // Write updated settings
            const updatedJsonString = JSON.stringify(settings, null, 2);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(updatedJsonString);
            
            file.replace_contents(
                bytes,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            console.log('Claude hook configuration removed');
            return true;
        } catch (e) {
            console.error('Failed to remove hook configuration:', e);
            return false;
        }
    }

    /**
     * Test hook functionality
     */
    async testHook() {
        const status = this.checkProviderStatus();
        return {
            success: true,
            providerStatus: status,
            message: this._getStatusMessage(status)
        };
    }

    /**
     * Get status message for exit code
     */
    _getStatusMessage(exitCode) {
        switch (exitCode) {
            case 0: return _('Provider configured successfully');
            case 1: return _('No provider configured');
            case 2: return _('Provider configured but missing API key');
            default: return _('Unknown provider status');
        }
    }

    /**
     * Cleanup when extension is disabled
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
        this._isEnabled = false;
        
        console.log('Claude Hook Interface destroyed');
    }
}

export default ClaudeHookInterface;