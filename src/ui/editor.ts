import { Container, Label } from '@playcanvas/pcui';
import { Mat4, path, Vec3 } from 'playcanvas';

import { DataPanel } from './data-panel';
import { Events } from '../events';
import { AboutPopup } from './about-popup';
import { BottomToolbar } from './bottom-toolbar';
import { ColorPanel } from './color-panel';
import { ExportPopup } from './export-popup';
import { ImageSettingsDialog } from './image-settings-dialog';
import { localize, localizeInit } from './localization';
import { Menu } from './menu';
import { ModeToggle } from './mode-toggle';
import logo from './playcanvas-logo.png';
import { Popup, ShowOptions } from './popup';
import { Progress } from './progress';
import { PublishSettingsDialog } from './publish-settings-dialog';
import { RightToolbar } from './right-toolbar';
import { ScenePanel } from './scene-panel';
import { ShortcutsPopup } from './shortcuts-popup';
import { Spinner } from './spinner';
import { TimelinePanel } from './timeline-panel';
import { Tooltips } from './tooltips';
import { VideoSettingsDialog } from './video-settings-dialog';
import { ViewCube } from './view-cube';
import { ViewPanel } from './view-panel';
import { version } from '../../package.json';

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;
interface EditorUIOptions {
    viewerOnly?: boolean;
}

const CAMERA_TARGETS = {
    image1: {
        position: { x: -0.09481655806303024, y: 1.9842095375061035, z: -30.723054885864258 },
        target: { x: 0.3025389442118099, y: 2.315386377683981, z: -49.691884485997235 }
    },
    image2: {
        position: { x: 0.8265447020530701, y: 2.75212025642395, z: -74.70670318603516 },
        target: { x: 13.980445489022944, y: 5.327443779980989, z: -88.1390024722935 }
    },
    image3: {
        position: { x: 0.9127567410469055, y: 9.438339233398438, z: -67.42160034179688 },
        target: { x: 0.8746512648643985, y: 5.859911900022582, z: -66.74004597150994 }
    }
} as const;

const VIEWER_NOTE = {
    position: { x: 3.3191983272917707, y: 3.0731552014743144, z: -76.79501217896394 },
    label: 'Wooden window frame'
} as const;

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

class EditorUI {
    appContainer: Container;
    topContainer: Container;
    canvasContainer: Container;
    toolsContainer: Container;
    canvas: HTMLCanvasElement;
    popup: Popup;

    constructor(events: Events, options: EditorUIOptions = {}) {
        const viewerOnly = options.viewerOnly ?? false;

        // favicon
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = logo;
        document.head.appendChild(link);

        // app
        const appContainer = new Container({
            id: 'app-container'
        });

        // editor
        const editorContainer = new Container({
            id: 'editor-container'
        });

        // tooltips container
        const tooltipsContainer = new Container({
            id: 'tooltips-container'
        });

        // top container
        const topContainer = new Container({
            id: 'top-container'
        });

        // canvas
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas';

        // app label
        const appLabel = new Label({
            id: 'app-label',
            text: `SUPERSPLAT v${version}`
        });

        // cursor label
        const cursorLabel = new Label({
            id: 'cursor-label'
        });

        let fullprecision = '';

        events.on('camera.focalPointPicked', (details: { position: Vec3 }) => {
            cursorLabel.text = `${details.position.x.toFixed(2)}, ${details.position.y.toFixed(2)}, ${details.position.z.toFixed(2)}`;
            fullprecision = `${details.position.x}, ${details.position.y}, ${details.position.z}`;
        });

        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            cursorLabel.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        cursorLabel.dom.addEventListener('pointerdown', () => {
            navigator.clipboard.writeText(fullprecision);

            const orig = cursorLabel.text;
            cursorLabel.text = localize('cursor.copied');
            setTimeout(() => {
                cursorLabel.text = orig;
            }, 1000);
        });

        // canvas container
        const canvasContainer = new Container({
            id: 'canvas-container'
        });

        // tools container
        const toolsContainer = new Container({
            id: 'tools-container'
        });

        // tooltips
        const tooltips = new Tooltips();
        tooltipsContainer.append(tooltips);

        canvasContainer.dom.appendChild(canvas);
        canvasContainer.append(appLabel);
        canvasContainer.append(cursorLabel);
        canvasContainer.append(toolsContainer);
        const rightToolbar = new RightToolbar(events, tooltips);

        if (!viewerOnly) {
            const scenePanel = new ScenePanel(events, tooltips);
            const viewPanel = new ViewPanel(events, tooltips);
            const colorPanel = new ColorPanel(events, tooltips);
            const bottomToolbar = new BottomToolbar(events, tooltips);
            const modeToggle = new ModeToggle(events, tooltips);
            const menu = new Menu(events);

            canvasContainer.append(scenePanel);
            canvasContainer.append(viewPanel);
            canvasContainer.append(colorPanel);
            canvasContainer.append(bottomToolbar);
            canvasContainer.append(rightToolbar);
            canvasContainer.append(modeToggle);
            canvasContainer.append(menu);
        } else {
            // Keep only navigation controls in viewer mode.
            canvasContainer.append(rightToolbar);

            // Camera presets for viewer mode.
            const presets = document.createElement('div');
            presets.id = 'viewer-camera-presets';

            const applyPreset = (key: keyof typeof CAMERA_TARGETS) => {
                const preset = CAMERA_TARGETS[key];
                const moveSpeed = 2.6;
                const moveEasing = 'easeIn';
                const pose = {
                    position: new Vec3(preset.position.x, preset.position.y, preset.position.z),
                    target: new Vec3(preset.target.x, preset.target.y, preset.target.z)
                };

                // Primary path through event bus.
                events.fire('camera.setPose', pose, moveSpeed, moveEasing);

                // Fallback path in case listener registration is missing in a custom build.
                const scene = (window as any).scene;
                scene?.camera?.setPose?.(pose.position, pose.target, moveSpeed, moveEasing);
                if (scene) {
                    scene.forceRender = true;
                }
                console.log(`[viewer-camera] moved to ${key}`);
            };

            const makeButton = (label: string, key: keyof typeof CAMERA_TARGETS) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'viewer-camera-button';
                button.textContent = label;
                button.style.pointerEvents = 'auto';
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    console.log(`[viewer-camera] click ${key}`);
                    applyPreset(key);
                });
                button.addEventListener('pointerdown', (event) => {
                    event.stopPropagation();
                });
                return button;
            };

            presets.appendChild(makeButton('Image 1', 'image1'));
            presets.appendChild(makeButton('Image 2', 'image2'));
            presets.appendChild(makeButton('Image 3', 'image3'));
            // Attach to body to avoid any canvas/container hit-testing quirks.
            document.body.appendChild(presets);

            // Single hardcoded annotation anchored to a world-space point.
            const note = document.createElement('div');
            note.id = 'viewer-annotation';

            const noteArrow = document.createElement('div');
            noteArrow.className = 'viewer-annotation-arrow';
            const noteLine = document.createElement('div');
            noteLine.className = 'viewer-annotation-line';
            const noteLabel = document.createElement('div');
            noteLabel.className = 'viewer-annotation-label';
            noteLabel.textContent = VIEWER_NOTE.label;

            note.appendChild(noteArrow);
            note.appendChild(noteLine);
            note.appendChild(noteLabel);
            document.body.appendChild(note);

            const noteWorld = new Vec3(VIEWER_NOTE.position.x, VIEWER_NOTE.position.y, VIEWER_NOTE.position.z);
            const noteScreen = new Vec3();

            const updateNote = () => {
                const scene = (window as any).scene;
                if (!scene?.camera?.worldToScreen) {
                    note.style.display = 'none';
                    return;
                }

                scene.camera.worldToScreen(noteWorld, noteScreen);

                const inside =
                    noteScreen.z >= 0 && noteScreen.z <= 1 &&
                    noteScreen.x >= 0 && noteScreen.x <= 1 &&
                    noteScreen.y >= 0 && noteScreen.y <= 1;

                if (!inside) {
                    note.style.display = 'none';
                    return;
                }

                const rect = canvas.getBoundingClientRect();
                note.style.display = 'flex';
                note.style.left = `${rect.left + noteScreen.x * rect.width}px`;
                note.style.top = `${rect.top + noteScreen.y * rect.height}px`;
            };

            events.on('prerender', updateNote);
            window.addEventListener('resize', updateNote);
        }

        // view axes container
        const viewCube = new ViewCube(events);
        canvasContainer.append(viewCube);
        events.on('prerender', (cameraMatrix: Mat4) => {
            viewCube.update(cameraMatrix);
        });

        // main container
        const mainContainer = new Container({
            id: 'main-container'
        });

        mainContainer.append(canvasContainer);
        if (!viewerOnly) {
            const timelinePanel = new TimelinePanel(events, tooltips);
            const dataPanel = new DataPanel(events);
            mainContainer.append(timelinePanel);
            mainContainer.append(dataPanel);
        }

        editorContainer.append(mainContainer);

        tooltips.register(cursorLabel, localize('cursor.click-to-copy'), 'top');

        // message popup
        const popup = new Popup(tooltips);

        // export popup
        const exportPopup = new ExportPopup(events);

        // publish settings
        const publishSettingsDialog = new PublishSettingsDialog(events);

        // image settings
        const imageSettingsDialog = new ImageSettingsDialog(events);

        // video settings
        const videoSettingsDialog = new VideoSettingsDialog(events);

        // about popup
        const aboutPopup = new AboutPopup();

        topContainer.append(popup);
        topContainer.append(exportPopup);
        topContainer.append(publishSettingsDialog);
        topContainer.append(imageSettingsDialog);
        topContainer.append(videoSettingsDialog);
        let shortcutsPopup: ShortcutsPopup = null;
        if (!viewerOnly) {
            shortcutsPopup = new ShortcutsPopup(events);
            topContainer.append(shortcutsPopup);
        }
        topContainer.append(aboutPopup);

        appContainer.append(editorContainer);
        appContainer.append(topContainer);
        appContainer.append(tooltipsContainer);

        this.appContainer = appContainer;
        this.topContainer = topContainer;
        this.canvasContainer = canvasContainer;
        this.toolsContainer = toolsContainer;
        this.canvas = canvas;
        this.popup = popup;

        document.body.appendChild(appContainer.dom);
        document.body.setAttribute('tabIndex', '-1');

        events.on('show.shortcuts', () => {
            if (shortcutsPopup) {
                shortcutsPopup.hidden = false;
            }
        });

        events.function('show.exportPopup', (exportType, splatNames: [string], showFilenameEdit: boolean) => {
            return exportPopup.show(exportType, splatNames, showFilenameEdit);
        });

        events.function('show.publishSettingsDialog', async () => {
            // show popup if user isn't logged in
            const userStatus = await events.invoke('publish.userStatus');
            if (!userStatus) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error'),
                    message: localize('popup.publish.please-log-in')
                });
                return false;
            }

            // get user publish settings
            const publishSettings = await publishSettingsDialog.show(userStatus);

            // do publish
            if (publishSettings) {
                await events.invoke('scene.publish', publishSettings);
            }
        });

        events.function('show.imageSettingsDialog', async () => {
            const imageSettings = await imageSettingsDialog.show();

            if (imageSettings) {
                await events.invoke('render.image', imageSettings);
            }
        });

        events.function('show.videoSettingsDialog', async () => {
            const videoSettings = await videoSettingsDialog.show();

            if (videoSettings) {

                try {
                    const docName = events.invoke('doc.name');

                    // Determine file extension and mime type based on format
                    let fileExtension: string;
                    let filePickerTypes: FilePickerAcceptType[];

                    // Codec name mapping for display
                    const codecNames: Record<string, string> = {
                        'h264': 'H.264',
                        'h265': 'H.265',
                        'vp9': 'VP9',
                        'av1': 'AV1'
                    };
                    const codecName = codecNames[videoSettings.codec] || videoSettings.codec.toUpperCase();

                    if (videoSettings.format === 'webm') {
                        fileExtension = '.webm';
                        filePickerTypes = [{
                            description: `WebM Video (${codecName})`,
                            accept: { 'video/webm': ['.webm'] }
                        }];
                    } else if (videoSettings.format === 'mov') {
                        fileExtension = '.mov';
                        filePickerTypes = [{
                            description: `MOV Video (${codecName})`,
                            accept: { 'video/quicktime': ['.mov'] }
                        }];
                    } else if (videoSettings.format === 'mkv') {
                        fileExtension = '.mkv';
                        filePickerTypes = [{
                            description: `MKV Video (${codecName})`,
                            accept: { 'video/x-matroska': ['.mkv'] }
                        }];
                    } else {
                        fileExtension = '.mp4';
                        filePickerTypes = [{
                            description: `MP4 Video (${codecName})`,
                            accept: { 'video/mp4': ['.mp4'] }
                        }];
                    }

                    const suggested = `${removeExtension(docName ?? 'supersplat')}${fileExtension}`;

                    let writable;

                    if (window.showSaveFilePicker) {
                        const fileHandle = await window.showSaveFilePicker({
                            id: 'SuperSplatVideoFileExport',
                            types: filePickerTypes,
                            suggestedName: suggested
                        });

                        writable = await fileHandle.createWritable();
                    }

                    await events.invoke('render.video', videoSettings, writable);
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        // user cancelled save dialog
                        return;
                    }

                    await events.invoke('showPopup', {
                        type: 'error',
                        header: 'Failed to render video',
                        message: `'${error.message ?? error}'`
                    });
                }
            }
        });

        events.on('show.about', () => {
            aboutPopup.hidden = false;
        });

        events.function('showPopup', (options: ShowOptions) => {
            return this.popup.show(options);
        });

        // spinner with reference counting to handle nested operations
        const spinner = new Spinner();
        topContainer.append(spinner);

        let spinnerCount = 0;

        events.on('startSpinner', () => {
            spinnerCount++;
            if (spinnerCount === 1) {
                spinner.hidden = false;
            }
        });

        events.on('stopSpinner', () => {
            spinnerCount = Math.max(0, spinnerCount - 1);
            if (spinnerCount === 0) {
                spinner.hidden = true;
            }
        });

        // progress

        const progress = new Progress();

        topContainer.append(progress);

        events.on('progressStart', (header: string) => {
            progress.hidden = false;
            progress.setHeader(header);
        });

        events.on('progressUpdate', (options: { text?: string, progress?: number }) => {
            if (options.text !== undefined) {
                progress.setText(options.text);
            }
            if (options.progress !== undefined) {
                progress.setProgress(options.progress);
            }
        });

        events.on('progressEnd', () => {
            progress.hidden = true;
        });

        // initialize canvas to correct size before creating graphics device etc
        const pixelRatio = window.devicePixelRatio;
        canvas.width = Math.ceil(canvasContainer.dom.offsetWidth * pixelRatio);
        canvas.height = Math.ceil(canvasContainer.dom.offsetHeight * pixelRatio);

        ['contextmenu', 'gesturestart', 'gesturechange', 'gestureend'].forEach((event) => {
            document.addEventListener(event, (e) => {
                e.preventDefault();
            }, true);
        });

        // whenever the canvas container is clicked, set keyboard focus on the body
        canvasContainer.dom.addEventListener('pointerdown', (event: PointerEvent) => {
            // set focus on the body if user is busy pressing on the canvas or a child of the tools
            // element
            if (event.target === canvas || toolsContainer.dom.contains(event.target as Node)) {
                document.body.focus();
            }
        }, true);
    }
}

export { EditorUI };
