You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

* Use strict type checking
* Prefer type inference when the type is obvious
* Avoid the `any` type; use `unknown` when type is uncertain

## Phaser Runtime Imports

* Import Phaser runtime APIs explicitly using named exports. Do not rely on a global `Phaser`: it is not available in this application's module-based runtime.
* Phaser 4's ESM build has no default export. Do not use `import Phaser from 'phaser'` for runtime calls.
* For example, use `import { Math as PhaserMath, type Scene } from 'phaser';` and call `PhaserMath.Between(...)`. Use type-only imports for types.
* TypeScript's Phaser declarations can allow an unimported `Phaser.Math.Between(...)` reference to compile even though it throws `ReferenceError: Phaser is not defined` at runtime.
* For changes to Phaser-backed UI actions, add or update a browser regression test that exercises the actual button or event handler. Run `yarn test` (headless Chromium),  `yarn run lint`, and `yarn run ng -- build`; component-creation tests alone did not catch the `Add New Sprite` failure.

## Angular Best Practices

* Always use standalone components over NgModules
* Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
* Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
* Use signals for state management
* Implement lazy loading for feature routes
* Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
* Use `NgOptimizedImage` for all static images.
  + `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

* It MUST pass all AXE checks.
* It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

* Keep components small and focused on a single responsibility
* Use `input()` and `output()` functions instead of decorators
* Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
* Use `computed()` for derived state
* Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
* Prefer inline templates for small components
* Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
* When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
* Do NOT use `ngClass`, use `class` bindings instead
* Do NOT use `ngStyle`, use `style` bindings instead
* Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
* When using external templates/styles, use paths relative to the component TS file.

## State Management

* Use signals for local component state
* Use `computed()` for derived state
* Keep state transformations pure and predictable
* Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

* Keep templates simple and avoid complex logic
* Use native control flow (`@if`,  `@for`,  `@switch`) instead of `*ngIf`,  `*ngFor`,  `*ngSwitch`
* Use the async pipe to handle observables
* Do not assume globals like (`new Date()`) are available.

## Services

* Design services around a single responsibility
* Use the `providedIn: 'root'` option for singleton services
* Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
* Use the `inject()` function instead of constructor injection
