export const deployments = {
  sourceToken: "0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9",
  vault: "0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583",
  settlementToken: "0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0",
  market: "0x7c3310280083eE63e32427D11d0A7C2CAf584474",
} as const;

export const actors = {
  payer: "0x9DDB9007583a7b9DF073B65bCE820f77D6E2365D",
  seller: "0xB9e1914C0844d9cd0188AdFFc10e3Bd6A633D12c",
  buyer: "0x8c48477bd205B0007d32A45ea3b7aE27745FDfbE",
} as const;

export type ActorRole = keyof typeof actors;

export function rolesFor(address: string): readonly ActorRole[] {
  const normalized = address.toLowerCase();
  return (Object.keys(actors) as ActorRole[]).filter(
    (role) => actors[role].toLowerCase() === normalized,
  );
}
