# Third-party licenses

License texts of the libraries bundled into the console's browser code, copied unchanged from their npm packages at the versions pinned in `package.json`. `src/lib/bundled-licenses.test.ts` fails when a pin stops being exact or a copy differs from the installed package.

| Library        | Used by                               | License                                                                  | Files    |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `@novnc/novnc` | VNC console of Connect to instance    | MPL-2.0, with the MIT and BSD-style parts that `novnc/LICENSE.txt` lists | `novnc/` |
| `@xterm/xterm` | Serial console of Connect to instance | MIT                                                                      | `xterm/` |

noVNC is used unmodified. Its source code is the npm package itself, and https://github.com/novnc/noVNC at the tag of the pinned version.
