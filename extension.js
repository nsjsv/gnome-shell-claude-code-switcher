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

import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ProviderStatus } from './lib/providerStatus.js';
import { SettingsManager } from './lib/settingsManager.js';
import { NotificationManager } from './lib/notificationManager.js';
import {
    DBUS_NAME,
    DBUS_PATH,
    DBUS_INTERFACE,
} from './lib/dbusUtils.js';

/**
 * @class Indicator
 * @description Manages the panel menu button (indicator) for the extension.
 * @extends PanelMenu.Button
 */
const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        /**
         * @param {Extension} extension - The main extension object.
         */
        _init(extension) {
            super._init(0.0, _('Claude Code Switcher'));
            this._extension = extension;
            this._settings = extension.getSettings();
            this._signalIds = [];

            this.add_child(
                new St.Icon({
                    icon_name: 'face-smile-symbolic',
                    style_class: 'system-status-icon',
                })
            );

            this._buildMenu();
            this._connectSettingsSignals();
        }

        /**
         * Connects signals to settings changes.
         * @private
         */
        _connectSettingsSignals() {
            const signals = {
                'changed::api-providers': () => this._rebuildMenu(),
                'changed::current-provider': () => this._updateCurrentProvider(),
            };

            for (const signal in signals) {
                this._signalIds.push(
                    this._settings.connect(signal, signals[signal])
                );
            }
        }

        /**
         * Builds the entire indicator menu.
         * @private
         */
        _buildMenu() {
            this.menu.removeAll();
            this._addProviderMenuItems();
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._addPreferencesMenuItem();
        }

        /**
         * Adds the menu item for opening preferences.
         * @private
         */
        _addPreferencesMenuItem() {
            let addMoreItem = new PopupMenu.PopupMenuItem(_('Add more..'));
            addMoreItem.connect('activate', () => this._openPreferences());
            this.menu.addMenuItem(addMoreItem);
        }

        /**
         * Adds API provider items to the menu.
         * @private
         */
        _addProviderMenuItems() {
            try {
                const providersJson =
                    this._settings.get_string('api-providers');
                if (!providersJson || providersJson.trim() === '') {
                    this._addNoProvidersItem();
                    return;
                }

                const providers = JSON.parse(providersJson);
                const currentProvider =
                    this._settings.get_string('current-provider');

                if (!Array.isArray(providers) || providers.length === 0) {
                    this._addNoProvidersItem();
                    return;
                }

                // 为每个提供商创建菜单项
                providers.forEach((provider, index) => {
                    try {
                        if (!provider || typeof provider.name !== 'string') {
                            console.warn(
                                `Invalid provider at index ${index}:`,
                                provider
                            );
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
                        console.error(
                            `Error creating menu item for provider ${provider?.name || 'unknown'}:`,
                            itemError
                        );
                    }
                });
            } catch (e) {
                console.error('Failed to load API providers:', e);
                this._addErrorItem(_('Failed to load providers'));
            }
        }

        /**
         * Adds a "No configured providers" item to the menu.
         * @private
         */
        _addNoProvidersItem() {
            let noProvidersItem = new PopupMenu.PopupMenuItem(
                _('No configured providers')
            );
            noProvidersItem.setSensitive(false);
            this.menu.addMenuItem(noProvidersItem);
        }

        /**
         * Adds an error message item to the menu.
         * @param {string} message - The error message to display.
         * @private
         */
        _addErrorItem(message) {
            let errorItem = new PopupMenu.PopupMenuItem(message);
            errorItem.setSensitive(false);
            this.menu.addMenuItem(errorItem);
        }

        /**
         * Selects an API provider.
         * @param {string} providerName - The name of the provider to select.
         * @private
         */
        _selectProvider(providerName) {
            try {
                if (this._checkProviderKey(providerName)) {
                    this._settings.set_string('current-provider', providerName);
                    this._extension.settingsManager
                        .syncToLocalFile()
                        .catch((e) => {
                            console.error('Error syncing to local file:', e);
                            Main.notify(
                                _('Configuration Error'),
                                _(
                                    'Failed to save configuration. Please check extension settings.'
                                )
                            );
                        });
                    Main.notify(_('Switched to: ') + providerName);
                } else {
                    this._showConfigureKeyNotification(providerName);
                }
            } catch (e) {
                console.error('Error selecting provider:', e);
                Main.notify(
                    _('Error switching provider'),
                    _('Please check the extension settings')
                );
            }
        }

        /**
         * Checks if a provider has a valid API key.
         * @param {string} providerName - The name of the provider to check.
         * @returns {boolean} - True if the key is valid, false otherwise.
         * @private
         */
        _checkProviderKey(providerName) {
            try {
                if (!providerName || typeof providerName !== 'string') {
                    console.warn('Invalid provider name:', providerName);
                    return false;
                }

                const providersJson =
                    this._settings.get_string('api-providers');
                if (!providersJson || providersJson.trim() === '') {
                    console.warn('No providers configuration found');
                    return false;
                }

                const providers = JSON.parse(providersJson);
                if (!Array.isArray(providers)) {
                    console.warn('Invalid providers format - not an array');
                    return false;
                }

                const provider = providers.find(
                    (p) => p && p.name === providerName
                );
                if (!provider) {
                    console.warn(`Provider '${providerName}' not found`);
                    return false;
                }

                const hasValidKey =
                    provider.key &&
                    typeof provider.key === 'string' &&
                    provider.key.trim() !== '';
                if (!hasValidKey) {
                    console.info(
                        `Provider '${providerName}' has no valid API key`
                    );
                }

                return hasValidKey;
            } catch (e) {
                console.error(
                    'Failed to check API key for provider:',
                    providerName,
                    e
                );
                return false;
            }
        }

        /**
         * Shows a notification to prompt the user to configure an API key.
         * @param {string} providerName - The name of the provider needing a key.
         * @private
         */
        _showConfigureKeyNotification(providerName) {
            if (
                providerName.includes('Anthropic') ||
                providerName.includes('默认')
            ) {
                Main.notify(
                    _('Please configure Anthropic API key first'),
                    _(
                        'Click "Add more.." button to open settings and configure the official API key for Anthropic provider.'
                    )
                );
            } else {
                Main.notify(
                    _('Please configure API key for ') +
                        providerName +
                        _(' first'),
                    _(
                        'Click "Add more.." button to open settings and configure the API key for this provider.'
                    )
                );
            }
        }

        /**
         * Rebuilds the menu, typically after settings change.
         * @private
         */
        _rebuildMenu() {
            this._buildMenu();
        }

        /**
         * Updates the provider checkmark in the menu.
         * @private
         */
        _updateCurrentProvider() {
            this._rebuildMenu();
        }

        /**
         * Opens the extension's preferences dialog.
         * @private
         */
        _openPreferences() {
            if (this._extension && this._extension.openPreferences) {
                this._extension.openPreferences();
            }
        }

        /**
         * Disconnects signals and cleans up resources.
         */
        destroy() {
            if (this._signalIds && this._settings) {
                this._signalIds.forEach((id) => {
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
    }
);

/**
 * @class IndicatorExampleExtension
 * @description The main class for the extension, handling enable/disable logic.
 */
export default class IndicatorExampleExtension extends Extension {
    // D-Bus method implementation
    ShowNotification(notificationType) {
        if (this._notificationManager) {
            this._notificationManager.showNotification(notificationType);
        }
    }

    /**
     * Enables the extension.
     * This method is called when the extension is activated.
     */
    enable() {
        this._settings = this.getSettings();
        this.settingsManager = new SettingsManager(this._settings, this);
        this._providerStatus = new ProviderStatus(this);
        this._notificationManager = new NotificationManager(this._settings);
        this._dbusOwnerId = 0;

        this._dbusOwnerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            DBUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            (connection, name) => { // onBusAcquired
                this._dbusExport = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE, this);
                this._dbusExport.export(connection, DBUS_PATH);
            },
            () => {}, // onNameAcquired
            () => { // onNameLost
                if (this._dbusExport) {
                    this._dbusExport.unexport();
                    this._dbusExport = null;
                }
            }
        );
 
        this._providerStatus
            .initialize()
            .catch((e) =>
                console.error('Failed to initialize Provider Status checker:', e)
            );
 
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
 
        this._connectSettingsSync();
    }

    /**
     * Connects signals for synchronizing settings to the local file.
     * Implements debouncing to prevent rapid, successive writes.
     * @private
     */
    _connectSettingsSync() {
        this._settingsChangedIds = [];
        this._syncTimeoutId = null;

        const settingsToWatch = [
            'current-provider',
            'auto-update',
            'proxy-host',
            'proxy-port',
            'notifications-enabled',
            'hook-task-completion',
            'hook-tool-auth',
        ];

        const debouncedSync = () => {
            if (this._syncTimeoutId) {
                GLib.source_remove(this._syncTimeoutId);
            }
            this._syncTimeoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.settingsManager
                    .syncToLocalFile()
                    .catch((e) => console.error('Error syncing to local file:', e));
                this._syncTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        };

        settingsToWatch.forEach((setting) => {
            this._settingsChangedIds.push(
                this._settings.connect(`changed::${setting}`, debouncedSync)
            );
        });

        // Initial sync on enable
        debouncedSync();
    }

    /**
     * Disables the extension.
     * This method is called when the extension is deactivated.
     */
    disable() {
        // Unexport D-Bus interface and release name
        if (this._dbusExport) {
            this._dbusExport.unexport();
            this._dbusExport = null;
        }
        if (this._dbusOwnerId) {
            Gio.bus_unown_name(this._dbusOwnerId);
            this._dbusOwnerId = 0;
        }

        // Cleanup Notification Manager
        if (this._notificationManager) {
            this._notificationManager.destroy();
            this._notificationManager = null;
        }

        // Cleanup Provider Status checker
        if (this._providerStatus) {
            try {
                this._providerStatus.destroy();
            } catch (e) {
                console.error('Error destroying Provider Status checker:', e);
            }
            this._providerStatus = null;
        }

        // 清理同步超时
        if (this._syncTimeoutId) {
            GLib.source_remove(this._syncTimeoutId);
            this._syncTimeoutId = null;
        }

        // 断开设置监听
        if (this._settingsChangedIds && this._settings) {
            this._settingsChangedIds.forEach((id) => {
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

        if (this.settingsManager) {
            // 在禁用时，异步清理本地配置文件中的钩子
            this.settingsManager
                .cleanupLocalFile()
                .catch((e) =>
                    console.error('Error during settings cleanup on disable:', e)
                );
            this.settingsManager.cleanup();
            this.settingsManager = null;
        }

        this._settings = null;
    }
}
