import Adw from 'gi://Adw';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * @class AboutGroup
 * @description Creates and manages the "About" section in the preferences window.
 */
export class AboutGroup {
    /**
     * @param {object} metadata - The extension's metadata.json object.
     */
    constructor(metadata) {
        this.metadata = metadata;
    }

    /**
     * Creates the "About" preferences group.
     * @returns {Adw.PreferencesGroup} The created "About" group widget.
     */
    createAboutGroup() {
        const aboutGroup = new Adw.PreferencesGroup({
            title: _('About'),
        });

        // 扩展基本信息
        const aboutRow = new Adw.ActionRow({
            title: _('Claude Code Switcher'),
            subtitle: _('Quickly switch Claude Code API providers'),
        });
        aboutGroup.add(aboutRow);

        // 版本信息
        if (this.metadata && this.metadata.version) {
            const versionRow = new Adw.ActionRow({
                title: _('Version'),
                subtitle: this.metadata.version.toString(),
            });
            aboutGroup.add(versionRow);
        }

        // 作者信息
        if (this.metadata && this.metadata.author) {
            const authorRow = new Adw.ActionRow({
                title: _('Author'),
                subtitle: this.metadata.author,
            });
            aboutGroup.add(authorRow);
        }

        return aboutGroup;
    }
}
