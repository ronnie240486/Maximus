// 35 avatar photos bundled locally (assets/images/avatars/avatar-1.jpg .. 35)
// so picking an avatar never needs a network request. Metro requires static
// `require()` calls (no dynamic paths), hence the explicit array below.
export type AvatarStyle = {
  id: string;
  image: number; // require() result
};

/* eslint-disable global-require */
const IMAGES: number[] = [
  require('../../assets/images/avatars/avatar-1.jpg'),
  require('../../assets/images/avatars/avatar-2.jpg'),
  require('../../assets/images/avatars/avatar-3.jpg'),
  require('../../assets/images/avatars/avatar-4.jpg'),
  require('../../assets/images/avatars/avatar-5.jpg'),
  require('../../assets/images/avatars/avatar-6.jpg'),
  require('../../assets/images/avatars/avatar-7.jpg'),
  require('../../assets/images/avatars/avatar-8.jpg'),
  require('../../assets/images/avatars/avatar-9.jpg'),
  require('../../assets/images/avatars/avatar-10.jpg'),
  require('../../assets/images/avatars/avatar-11.jpg'),
  require('../../assets/images/avatars/avatar-12.jpg'),
  require('../../assets/images/avatars/avatar-13.jpg'),
  require('../../assets/images/avatars/avatar-14.jpg'),
  require('../../assets/images/avatars/avatar-15.jpg'),
  require('../../assets/images/avatars/avatar-16.jpg'),
  require('../../assets/images/avatars/avatar-17.jpg'),
  require('../../assets/images/avatars/avatar-18.jpg'),
  require('../../assets/images/avatars/avatar-19.jpg'),
  require('../../assets/images/avatars/avatar-20.jpg'),
  require('../../assets/images/avatars/avatar-21.jpg'),
  require('../../assets/images/avatars/avatar-22.jpg'),
  require('../../assets/images/avatars/avatar-23.jpg'),
  require('../../assets/images/avatars/avatar-24.jpg'),
  require('../../assets/images/avatars/avatar-25.jpg'),
  require('../../assets/images/avatars/avatar-26.jpg'),
  require('../../assets/images/avatars/avatar-27.jpg'),
  require('../../assets/images/avatars/avatar-28.jpg'),
  require('../../assets/images/avatars/avatar-29.jpg'),
  require('../../assets/images/avatars/avatar-30.jpg'),
  require('../../assets/images/avatars/avatar-31.jpg'),
  require('../../assets/images/avatars/avatar-32.jpg'),
  require('../../assets/images/avatars/avatar-33.jpg'),
  require('../../assets/images/avatars/avatar-34.jpg'),
  require('../../assets/images/avatars/avatar-35.jpg'),
];
/* eslint-enable global-require */

// Same id scheme as before (avatar_1..avatar_N) so any profile a person
// already picked (avatar_1..avatar_8) keeps working — it just now resolves
// to a real photo instead of a colored circle+letter.
export const AVATARS: AvatarStyle[] = IMAGES.map((image, i) => ({
  id: `avatar_${i + 1}`,
  image,
}));

export function getAvatar(id?: string | null): AvatarStyle {
  if (!id) return AVATARS[0];
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}
