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

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * @class ProviderStatus
 * @description A helper class to check the configuration status of the current API provider.
 */
export class ProviderStatus {
    /**
     * @param {Extension} extension - The main extension object.
     */
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._isEnabled = true; // Simplified: always consider it "enabled"
    }

    /**
     * Initializes the checker. Currently a no-op.
     * @returns {Promise<void>}
     */
    async initialize() {
        console.log('Provider Status checker initialized.');
    }

    /**
     * Checks the configuration status of the current provider.
     * @returns {number} - An exit code representing the status:
     *                    0: Configured successfully
     *                    1: No provider configured
     *                    2: Provider configured but missing API key
     *                    3: Unknown error
     */
    checkProviderStatus() {
        try {
            const currentProvider =
                this._settings.get_string('current-provider');
            if (!currentProvider || currentProvider === 'null') {
                return 1; // No provider configured
            }

            const providersJson = this._settings.get_string('api-providers');
            const providers = JSON.parse(providersJson);
            const provider = providers.find((p) => p.name === currentProvider);

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
     * Gets an object representing the current status.
     * @returns {{enabled: boolean, providerStatus: number}}
     */
    getStatus() {
        return {
            enabled: this._isEnabled,
            providerStatus: this.checkProviderStatus(),
        };
    }

    /**
     * Runs a test of the provider status check.
     * @returns {{success: boolean, providerStatus: number, message: string}}
     */
    testHook() {
        const status = this.checkProviderStatus();
        return {
            success: true,
            providerStatus: status,
            message: this._getStatusMessage(status),
        };
    }

    /**
     * Gets a human-readable message for a given status code.
     * @param {number} exitCode - The status code from `checkProviderStatus`.
     * @returns {string} - The corresponding status message.
     * @private
     */
    _getStatusMessage(exitCode) {
        switch (exitCode) {
            case 0:
                return _('Provider configured successfully');
            case 1:
                return _('No provider configured');
            case 2:
                return _('Provider configured but missing API key');
            default:
                return _('Unknown provider status');
        }
    }

    /**
     * Cleans up resources when the extension is disabled.
     */
    destroy() {
        this._extension = null;
        this._settings = null;
        this._isEnabled = false;
        console.log('Provider Status checker destroyed.');
    }
}

export default ProviderStatus;
