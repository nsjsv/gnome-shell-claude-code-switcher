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
        this._initialize();
    }

    /**
     * Initialize hook interface
     */
    _initialize() {
        try {
            this._setupHookConfig();
            this._isEnabled = true;
            console.log('Claude Hook Interface initialized');
        } catch (e) {
            console.error('Failed to initialize Claude Hook Interface:', e);
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
            console.log(`Notifications enabled: ${notificationsEnabled}`);

            // Configure hooks based on notification setting
            if (notificationsEnabled) {
                console.log('Adding Claude Code Switcher hooks...');
                // Add our hooks if notifications are enabled
                const ourHooks = {
                    'UserPromptSubmit': this._createUserPromptSubmitHooks(),
                    'PreToolUse': this._createPreToolUseHooks(),
                    'PostToolUse': this._createPostToolUseHooks(),
                    'Stop': this._createStopHooks()
                };

                // Merge our hooks with existing ones
                Object.keys(ourHooks).forEach(eventName => {
                    const hooksForEvent = ourHooks[eventName];
                    console.log(`Processing ${eventName} with ${hooksForEvent ? hooksForEvent.length : 0} hooks`);
                    
                    if (!settings.hooks[eventName]) {
                        settings.hooks[eventName] = ourHooks[eventName];
                    } else {
                        // Preserve existing hooks and add ours
                        // Check if our hooks already exist to avoid duplicates
                        const existingHooks = settings.hooks[eventName];
                        const newHooks = ourHooks[eventName];
                        
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
                });
            } else {
                // Remove our hooks if notifications are disabled
                // But preserve other hooks that don't belong to us
                const eventNames = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'];
                
                eventNames.forEach(eventName => {
                    if (settings.hooks[eventName]) {
                        // Filter out our hooks (identified by "Claude Code Switcher" in command)
                        settings.hooks[eventName] = settings.hooks[eventName].filter(hook => {
                            if (hook.hooks && Array.isArray(hook.hooks)) {
                                return !hook.hooks.some(h => 
                                    h.command && h.command.includes('Claude Code Switcher')
                                );
                            }
                            return true;
                        });
                        
                        // Remove the event entirely if no hooks remain
                        if (settings.hooks[eventName].length === 0) {
                            delete settings.hooks[eventName];
                        }
                    }
                });
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
     * Create UserPromptSubmit hook configuration (官方格式)
     */
    _createUserPromptSubmitHooks() {
        return [
            {
                "matcher": "*", // 匹配所有提示
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo 'Claude Code Switcher: Prompt submitted' && exit 0"
                    }
                ]
            }
        ];
    }

    /**
     * Create PreToolUse hook configuration (官方格式)
     */
    _createPreToolUseHooks() {
        return [
            {
                "matcher": "*", // 匹配所有工具
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo 'Claude Code Switcher: Tool starting' && exit 0"
                    }
                ]
            }
        ];
    }

    /**
     * Create PostToolUse hook configuration (官方格式)
     */
    _createPostToolUseHooks() {
        return [
            {
                "matcher": "*", // 匹配所有工具
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo 'Claude Code Switcher: Tool completed' && exit 0"
                    }
                ]
            }
        ];
    }

    /**
     * Create Stop hook configuration (官方格式)
     */
    _createStopHooks() {
        return [
            {
                "matcher": "*", // 匹配所有停止事件
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo 'Claude Code Switcher: Session stopped' && exit 0"
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
                settings.hooks['UserPromptSubmit'] || 
                settings.hooks['PreToolUse'] || 
                settings.hooks['PostToolUse'] || 
                settings.hooks['Stop']
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
                // Go through each event and remove only our hooks
                ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'].forEach(eventName => {
                    if (settings.hooks[eventName] && Array.isArray(settings.hooks[eventName])) {
                        settings.hooks[eventName] = settings.hooks[eventName].filter(hookGroup => {
                            // Check if this is one of our hooks
                            if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
                                const isOurHook = hookGroup.hooks.some(hook => 
                                    hook.command && hook.command.includes('Claude Code Switcher')
                                );
                                return !isOurHook; // Keep if it's not our hook
                            }
                            return true; // Keep if structure is different
                        });
                        
                        // Remove the event key if no hooks remain
                        if (settings.hooks[eventName].length === 0) {
                            delete settings.hooks[eventName];
                        }
                    }
                });
                
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
        // Optionally remove hook configuration when extension is disabled
        // For now, we keep it for Claude Code to continue using
        this._isEnabled = false;
        console.log('Claude Hook Interface destroyed');
    }
}

export default ClaudeHookInterface;