import { Redirect } from 'expo-router';

/** Legacy /signup → home (Get ticket is now `/`). */
export default function SignupRoute() {
  return <Redirect href="/" />;
}
