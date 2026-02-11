// Tests for API utilities

import { describe, it, expect } from 'vitest';
import {
  isValidAddress,
  parseIntParam,
  parseAddressParam,
  parseBooleanParam,
  serializeBigInts,
} from './utils.js';

describe('API Utils', () => {
  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0xABCDEF1234567890123456789012345678901234')).toBe(true);
      expect(isValidAddress('0xabcdef1234567890123456789012345678901234')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false);
      expect(isValidAddress('0xGGGG567890123456789012345678901234567890')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });

  describe('parseIntParam', () => {
    it('should parse valid integers', () => {
      expect(parseIntParam('42', 0)).toBe(42);
      expect(parseIntParam('0', 10)).toBe(0);
      expect(parseIntParam('100', 50)).toBe(100);
    });

    it('should return default for invalid values', () => {
      expect(parseIntParam(undefined, 10)).toBe(10);
      expect(parseIntParam(['1', '2'], 10)).toBe(10);
      expect(parseIntParam('not-a-number', 10)).toBe(10);
    });
  });

  describe('parseAddressParam', () => {
    it('should return address for valid input', () => {
      const addr = '0x1234567890123456789012345678901234567890';
      expect(parseAddressParam(addr)).toBe(addr);
    });

    it('should return undefined for invalid input', () => {
      expect(parseAddressParam(undefined)).toBeUndefined();
      expect(parseAddressParam(['addr1', 'addr2'])).toBeUndefined();
      expect(parseAddressParam('invalid')).toBeUndefined();
    });
  });

  describe('parseBooleanParam', () => {
    it('should parse boolean strings', () => {
      expect(parseBooleanParam('true')).toBe(true);
      expect(parseBooleanParam('false')).toBe(false);
    });

    it('should return undefined for invalid input', () => {
      expect(parseBooleanParam(undefined)).toBeUndefined();
      expect(parseBooleanParam('yes')).toBeUndefined();
      expect(parseBooleanParam(['true'])).toBeUndefined();
    });
  });

  describe('serializeBigInts', () => {
    it('should convert bigints to strings', () => {
      expect(serializeBigInts(123n)).toBe('123');
      expect(serializeBigInts(0n)).toBe('0');
    });

    it('should handle nested objects', () => {
      const obj = {
        value: 100n,
        nested: {
          inner: 200n,
        },
      };

      const result = serializeBigInts(obj);

      expect(result.value).toBe('100');
      expect(result.nested.inner).toBe('200');
    });

    it('should handle arrays', () => {
      const arr = [1n, 2n, 3n];
      const result = serializeBigInts(arr);

      expect(result).toEqual(['1', '2', '3']);
    });

    it('should preserve other types', () => {
      expect(serializeBigInts('string')).toBe('string');
      expect(serializeBigInts(42)).toBe(42);
      expect(serializeBigInts(null)).toBe(null);
      expect(serializeBigInts(undefined)).toBe(undefined);
      expect(serializeBigInts(true)).toBe(true);
    });
  });
});
