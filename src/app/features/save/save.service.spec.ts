import { TestBed } from '@angular/core/testing';
import { SaveService } from './save.service';

describe('SaveService', () => {
  let service: SaveService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SaveService);
    await service.clear();
  });

  afterEach(async () => {
    await service.clear();
    TestBed.resetTestingModule();
  });

  it('commits imported records before resolving and preserves records when validation fails', async () => {
    const record = { id: 1, name: 'Developer slot', value: 0.42 };
    await service.save(record);
    await expect(service.import('[{"id":2,"name":"Bad","value":"invalid"}]')).rejects.toThrow();
    expect(await service.loadAll()).toEqual([record]);
    await expect(service.import(JSON.stringify([record, record]))).rejects.toThrow('Duplicate');
    await service.import('[{"id":2,"name":"Imported","value":0.5}]');
    expect(await service.load(2)).toEqual({ id: 2, name: 'Imported', value: 0.5 });
    expect(JSON.parse(await service.export())).toHaveLength(2);
    await service.delete(1);
    expect(await service.load(1)).toBeUndefined();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
