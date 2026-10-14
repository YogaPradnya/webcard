import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { optImg } from '../../src/lib/images.js';

describe('optImg', () => {
  it('cloudinary dapat transformasi f_auto/q_auto/lebar', () => {
    assert.equal(
      optImg('https://res.cloudinary.com/demo/image/upload/v1/animein/cards/a.jpg', 300),
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_300/v1/animein/cards/a.jpg',
    );
  });
  it('non-cloudinary & kosong tidak diubah, transformasi ganda dicegah', () => {
    assert.equal(optImg('https://cdn.example.com/x.jpg', 300), 'https://cdn.example.com/x.jpg');
    assert.equal(optImg('', 300), '');
    assert.equal(
      optImg('https://res.cloudinary.com/d/image/upload/f_auto,q_auto,w_200/a.jpg', 300),
      'https://res.cloudinary.com/d/image/upload/f_auto,q_auto,w_200/a.jpg',
    );
  });
});
