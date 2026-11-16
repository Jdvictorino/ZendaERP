import { formatEmployeeId, nextEmployeeId } from '../backend/src/services/employeeNumber.js';

const fakeTx = (ids) => ({
  $queryRaw: async () => [],
  user: { findMany: async () => ids.map((employeeId) => ({ employeeId })) },
});

test('formato EMP-00001', () => {
  expect(formatEmployeeId(1)).toBe('EMP-00001');
  expect(formatEmployeeId(123456)).toBe('EMP-123456');
});

test('sigue después del mayor número de la empresa', async () => {
  expect(await nextEmployeeId(fakeTx([]), 'c1')).toBe('EMP-00001');
  expect(await nextEmployeeId(fakeTx(['EMP-00001', 'EMP-00007', 'EMP-00003']), 'c1')).toBe('EMP-00008');
  expect(await nextEmployeeId(fakeTx(['EMP-00002', 'EMP-raro']), 'c1')).toBe('EMP-00003');
});
