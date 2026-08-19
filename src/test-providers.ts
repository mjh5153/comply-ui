

import {provideZonelessChangeDetection} from '@angular/core';

/**
 * Providers applied to every TestBed by @angular/build:unit-test.
 *
 * The app runs zoneless on Angular 22, so tests must too - otherwise the
 * builder falls back to importing zone.js/testing.
 */
export default [
    provideZonelessChangeDetection()
];
