You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

* Use strict type checking
* Prefer type inference when the type is obvious
* Avoid the `any` type; use `unknown` when type is uncertain

## Scrapworks 3D direction and implementation ownership

* Angular owns application UI; Babylon owns world presentation; one Babylon.js Editor project owns scenes and world layout. Attached Editor scripts are presentation/scene bindings only.
* The user implements actual game/runtime behavior. Cleanup work may change documentation, metadata, and supporting tools, but must not implement gameplay or alter `src/` without a later user request. You have explict permission to add tests to the project.
* Keep authoritative movement, inventory, production, research, pollution, and time in plain TypeScript. Keep simulation/contracts/core free of Angular, renderer, storage, DOM, and wall-clock dependencies.
* Distinguish renderer lifecycle `GameState`, planned mutable `WorldState`, and planned authored initial `WorldDefinition`. Convert Editor centimetres to gameplay metres at the boundary. Scene serialization is not a gameplay save.
* Keep source Blender projects, artwork, references and provenance together under root `art/`;  `docs/art/README.md` owns visual guidance. Editor-authored scenes/imports remain in `assets/`. Preserve complete authored scene directories and exact art provenance. Generated exports, caches, and `src/scripts.ts` stay ignored. Update authoritative Mermaid blocks and regenerate matching `.mmd`, SVG, and PNG files together.
* Keep older 2D instructions under clearly labelled history, with forwarding links and unchanged dated evidence. See `docs/plans/3d-cleanup.md` and `docs/plans/3d-cleanup-baseline.md`.

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
* Use native control flow (`@if`,    `@for`,    `@switch`) instead of `*ngIf`,    `*ngFor`,    `*ngSwitch`
* Use the async pipe to handle observables
* Do not assume globals like (`new Date()`) are available.

## Services

* Design services around a single responsibility
* Use the `providedIn: 'root'` option for singleton services
* Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
* Use the `inject()` function instead of constructor injection
