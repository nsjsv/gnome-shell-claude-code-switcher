import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * @class NotificationManager
 * @description Manages displaying notifications within the GNOME Shell process.
 */
export class NotificationManager {
    /**
     * @param {Gio.Settings} settings - The GSettings object for the extension.
     */
    constructor(settings) {
        this._settings = settings;
    }

    /**
     * Shows a notification based on its type.
     * This is the main entry point called by the D-Bus service.
     * @param {string} notificationType - The type of notification (e.g., 'taskCompletion').
     */
    showNotification(notificationType) {
        try {
            if (!this._settings) {
                console.error('NotificationManager: Settings object is not available.');
                return;
            }

            const { enabled, title, message, iconName } =
                this._getNotificationConfig(notificationType);

            if (enabled) {
                Main.notify(title, message, iconName);
                this._playSound();
            } else {
                console.log(`Notification of type '${notificationType}' is disabled.`);
            }
        } catch (e) {
            console.error(`Failed to show notification for type '${notificationType}':`, e);
        }
    }

    /**
     * Retrieves the specific configuration for a notification type from GSettings.
     * @param {string} notificationType - The type of the notification.
     * @returns {{enabled: boolean, title: string, message: string, iconName: string}}
     * @private
     */
    _getNotificationConfig(notificationType) {
        const config = {
            enabled: false,
            title: _('Claude Code Event'),
            message: _('An event was triggered.'),
            iconName: 'dialog-information-symbolic',
        };

        if (notificationType === 'taskCompletion') {
            config.enabled = this._settings.get_boolean('hook-task-completion');
            config.title = _('Claude Code Task Event');
            config.message =
                this._settings.get_string('task-completion-message') ||
                _('Claude Code task event triggered.');
            config.iconName = 'emblem-ok-symbolic';
        } else if (notificationType === 'toolAuth') {
            config.enabled = this._settings.get_boolean('hook-tool-auth');
            config.title = _('Claude Code Tool Event');
            config.message =
                this._settings.get_string('tool-auth-message') ||
                _('Claude Code tool authorization event triggered.');
            config.iconName = 'dialog-question-symbolic';
        }

        return config;
    }

    /**
     * Plays a notification sound based on user settings.
     * @private
     */
    _playSound() {
        try {
            const soundEnabled = this._settings.get_boolean('notification-sound-enabled');
            if (!soundEnabled) {
                return;
            }

            const player = global.display.get_sound_player();
            const soundFile = this._settings.get_string('notification-sound-file');
            
            if (soundFile && soundFile.trim()) {
                // Play custom sound file
                const file = Gio.File.new_for_path(soundFile);
                player.play_from_file(file, _('Claude Code Notification'), null);
            } else {
                // Play default notification sound from theme
                player.play_from_theme('message-new-instant', _('Claude Code Notification'), null);
            }
        } catch (e) {
            console.error('Failed to play notification sound:', e);
        }
    }

    /**
     * Cleans up resources.
     */
    destroy() {
        this._settings = null;
    }
}