import Adw from 'gi://Adw';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/**
 * 关于组件
 * 负责创建和管理关于扩展的信息界面
 */
export class AboutGroup {
    constructor(metadata) {
        this.metadata = metadata;
    }

    /**
     * 创建关于组
     * @returns {Adw.PreferencesGroup} 关于组
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