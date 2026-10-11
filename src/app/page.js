import { redirect } from 'next/navigation';

// Halaman depan selalu mengarah ke book (book yang menjaga login).
export default function Home() {
  redirect('/book');
}
