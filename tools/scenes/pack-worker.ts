import { pack } from 'babylonjs-editor-cli';

// Isolate upstream tasks that can reject outside the packer's returned promise.
await pack(process.argv[2], { optimize: true });
