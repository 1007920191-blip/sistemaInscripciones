import { TestBed } from '@angular/core/testing';

import { Impresion } from './impresion';

describe('Impresion', () => {
  let service: Impresion;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Impresion);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
