/* hookInterface.js
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

export class ClaudeCodeHookInterface {
    constructor() {
        this.hookScriptPath = this._getHookScriptPath();
        this._ensureHookScript();
    }

    _getHookScriptPath() {
        const homeDir = GLib.get_home_dir();
        const claudeDir = GLib.build_filenamev([homeDir, '.claude']);
        return GLib.build_filenamev([claudeDir, 'gnome-extension-hook.sh']);
    }

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

    _ensureHookScript() {
        if (!this._ensureClaudeDir()) {
            return false;
        }

        const file = Gio.File.new_for_path(this.hookScriptPath);
        
        if (!file.query_exists(null)) {
            this._createDefaultHookScript();
        }
        
        return true;
    }

    _createDefaultHookScript() {
        const hookScript = `#!/bin/bash
# Claude Code Hook Script for GNOME Extension
# This script is called by the Claude Code Switcher extension
# to handle Claude Code events

HOOK_TYPE="$1"
EXIT_CODE="$2"
PROVIDER_NAME="$3"

case "$HOOK_TYPE" in
    "exit")
        if [ "$EXIT_CODE" = "0" ]; then
            # Success notification
            notify-send "Claude Code" "Task completed successfully with provider: $PROVIDER_NAME" --icon=dialog-information
        else
            # Error notification  
            notify-send "Claude Code" "Task failed (exit code: $EXIT_CODE) with provider: $PROVIDER_NAME" --icon=dialog-error
        fi
        ;;
    "provider-switch")
        # Provider switched notification
        notify-send "Claude Code Switcher" "Switched to provider: $PROVIDER_NAME" --icon=preferences-system
        ;;
    *)
        echo "Unknown hook type: $HOOK_TYPE"
        exit 1
        ;;
esac

exit 0
`;

        try {
            const file = Gio.File.new_for_path(this.hookScriptPath);
            const encoder = new TextEncoder();
            const bytes = encoder.encode(hookScript);
            
            file.replace_contents(
                bytes,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );

            // Make script executable
            const fileInfo = file.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
            const currentMode = fileInfo.get_attribute_uint32('unix::mode');
            const executableMode = currentMode | 0o755;
            
            file.set_attribute_uint32('unix::mode', executableMode, Gio.FileQueryInfoFlags.NONE, null);
            
            console.log('Created default hook script:', this.hookScriptPath);
            return true;
        } catch (e) {
            console.error('Failed to create hook script:', e);
            return false;
        }
    }

    callHook(hookType, exitCode = 0, providerName = '') {
        if (!Gio.File.new_for_path(this.hookScriptPath).query_exists(null)) {
            console.log('Hook script does not exist, creating default...');
            if (!this._createDefaultHookScript()) {
                return false;
            }
        }

        try {
            const argv = [
                '/bin/bash',
                this.hookScriptPath,
                hookType,
                exitCode.toString(),
                providerName || ''
            ];

            let proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_async(null, null, (proc, result) => {
                try {
                    const [, stdout, stderr] = proc.communicate_finish(result);
                    const exitStatus = proc.get_exit_status();
                    
                    if (exitStatus !== 0) {
                        const stderrText = new TextDecoder().decode(stderr);
                        console.error('Hook script failed:', stderrText);
                    } else {
                        console.log('Hook executed successfully:', hookType);
                    }
                } catch (e) {
                    console.error('Hook execution error:', e);
                }
            });

            return true;
        } catch (e) {
            console.error('Failed to execute hook:', e);
            return false;
        }
    }

    onExit(exitCode, providerName) {
        return this.callHook('exit', exitCode, providerName);
    }

    onProviderSwitch(providerName) {
        return this.callHook('provider-switch', 0, providerName);
    }

    getHookScriptPath() {
        return this.hookScriptPath;
    }

    isHookEnabled() {
        return Gio.File.new_for_path(this.hookScriptPath).query_exists(null);
    }
    
    // 简单的退出代码处理方法
    handleExitCode(exitCode, context = '') {
        // 根据退出代码显示不同的通知
        let message = '';
        let urgency = 'normal';
        
        switch (exitCode) {
            case 0:
                message = _('Claude Code completed successfully');
                if (context) {
                    message += `: ${context}`;
                }
                urgency = 'low';
                break;
            case 1:
                message = _('Claude Code encountered an error');
                if (context) {
                    message += `: ${context}`;
                }
                urgency = 'high';
                break;
            case 130:
                message = _('Claude Code was interrupted');
                urgency = 'normal';
                break;
            case 143:
                message = _('Claude Code was terminated');
                urgency = 'normal';
                break;
            default:
                message = _('Claude Code exited with code ') + exitCode;
                if (context) {
                    message += `: ${context}`;
                }
                urgency = 'normal';
        }
        
        // 发送系统通知
        this._sendNotification(message, urgency);
        
        // 记录到日志
        console.log(`Claude Code exit handler: code=${exitCode}, context=${context}`);
        
        // 调用通用的exit hook
        return this.onExit(exitCode, context);
    }

    _sendNotification(message, urgency = 'normal') {
        try {
            const argv = ['notify-send', 'Claude Code', message, '--icon', 'dialog-information'];
            
            // 根据紧急程度添加参数
            if (urgency === 'high') {
                argv.push('--urgency=critical');
            } else if (urgency === 'low') {
                argv.push('--urgency=low');
            }
            
            let proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.NONE
            );
            
            proc.wait_async(null, null, (proc, result) => {
                try {
                    proc.wait_finish(result);
                } catch (e) {
                    console.error('Failed to send notification:', e);
                }
            });
        } catch (e) {
            console.error('Failed to create notification:', e);
        }
    }
}

export default ClaudeCodeHookInterface;