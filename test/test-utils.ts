// test/test-utils.ts
import type { Repository } from 'typeorm';
import type { ClientProxy } from '@nestjs/microservices';
import { of, type Observable } from 'rxjs';

/** Мини-интерфейс для QB, достаточно для наших тестов */
export interface QueryBuilderLike<T = any> {
  select: (...args: any[]) => QueryBuilderLike<T>;
  addSelect: (...args: any[]) => QueryBuilderLike<T>;
  where: (...args: any[]) => QueryBuilderLike<T>;
  orderBy: (...args: any[]) => QueryBuilderLike<T>;
  getRawMany: () => Promise<T[]>;
}

/** Мок TypeORM Repository — только то, что реально используем в тестах */
export function makeRepoMock<T extends object>(): jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'upsert' | 'createQueryBuilder'>
> {
  const repo: Partial<Repository<T>> = {
    findOne: jest.fn<Promise<T | null>, [any]>(),
    upsert: jest.fn<Promise<any>, [any, any]>(),
  };

  // createQueryBuilder должен совпадать по сигнатуре с реальным типом
  const createQB = jest.fn() as unknown as Repository<T>['createQueryBuilder'];
  (repo as any).createQueryBuilder = createQB;

  return repo as jest.Mocked<
    Pick<Repository<T>, 'findOne' | 'upsert' | 'createQueryBuilder'>
  >;
}

/** Мок Nest ClientProxy — send/emit возвращают Observable */
export function makeClientMock(): jest.Mocked<
  Pick<ClientProxy, 'send' | 'emit'>
> {
  const mock: Partial<jest.Mocked<Pick<ClientProxy, 'send' | 'emit'>>> = {
    send: jest.fn<Observable<any>, [any, any]>().mockReturnValue(of(undefined)),
    emit: jest.fn<Observable<any>, [any, any]>().mockReturnValue(of(undefined)),
  };

  return mock as jest.Mocked<Pick<ClientProxy, 'send' | 'emit'>>;
}

/** Упрощённый QueryBuilder с чейнингом и предустановленным ответом */
export function makeQBMock<T = any>(rawMany: T[] = []): QueryBuilderLike<T> {
  const qb: QueryBuilderLike<T> = {
    select: () => qb,
    addSelect: () => qb,
    where: () => qb,
    orderBy: () => qb,
    getRawMany: jest.fn<Promise<T[]>, []>().mockResolvedValue(rawMany),
  };
  return qb;
}
