import { Redirect } from 'expo-router';

/** Any unknown route → Get (root). */
export default function NotFound() {
  return <Redirect href="/" />;
}
