#!/usr/bin/env gjs

/**
 * Claude Code D-Bus Notification Client
 * This script is called by Claude Code hooks to trigger a notification
 * via the main extension process over D-Bus. It uses a MainLoop to ensure
 * the async D-Bus call completes before exiting.
 */

const { Gio, GLib } = imports.gi;

const DBUS_NAME = 'org.gnome.shell.extensions.claude_code_switcher';
const DBUS_PATH = '/org/gnome/shell/extensions/claude_code_switcher';
const DBUS_INTERFACE_XML = `
<node>
    <interface name="${DBUS_NAME}">
        <method name="ShowNotification">
            <arg type="s" name="notificationType" direction="in"/>
        </method>
    </interface>
</node>`;

// Main execution logic
try {
    // 1. Create a MainLoop
    const loop = new GLib.MainLoop(null, false);

    // 2. Parse arguments
    let notificationType = 'unknown';
    if (imports.system.programArgs.length > 0) {
        notificationType = imports.system.programArgs[0];
    }

    // 3. Create a D-Bus proxy
    const DbusProxy = Gio.DBusProxy.makeProxyWrapper(DBUS_INTERFACE_XML);
    const proxy = new DbusProxy(
        Gio.DBus.session,
        DBUS_NAME,
        DBUS_PATH,
        (p, error) => {
            if (error) {
                console.error(`Failed to create D-Bus proxy: ${error.message}`);
                loop.quit();
                imports.system.exit(1);
            }
        }
    );

    // 4. Call the remote method
    console.log(`Sending notification of type '${notificationType}' via D-Bus...`);
    proxy.ShowNotificationAsync(notificationType)
        .then(() => {
            console.log('Notification sent successfully.');
            loop.quit();
        })
        .catch(e => {
            console.error(`Error calling D-Bus method: ${e.message}`);
            loop.quit();
            imports.system.exit(1);
        });

    // 5. Run the loop, which will block until loop.quit() is called
    loop.run();

} catch (e) {
    console.error(`An unexpected error occurred: ${e.message}`);
    imports.system.exit(1);
}