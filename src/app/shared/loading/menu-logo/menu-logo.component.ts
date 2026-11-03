import { Component } from '@angular/core';
import { IMAGE_LOADER, NgOptimizedImage, type ImageLoaderConfig } from '@angular/common';

@Component({
  imports: [NgOptimizedImage],
  host: { class: 'title-image' },
  providers: [
    {
      provide: IMAGE_LOADER,
      useValue: ({ src, width }: ImageLoaderConfig) => `${src}-${width ?? 640}.webp`,
    },
  ],
  selector: 'app-menu-logo',
  templateUrl: './menu-logo.component.html',
})
export class MenuLogoComponent {}
