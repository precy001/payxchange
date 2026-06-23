import { createNavigationContainerRef } from '@react-navigation/native';

// Lets non-component code (e.g. a notification tap handler) navigate.
export const navigationRef = createNavigationContainerRef<any>();