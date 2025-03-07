import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { JupiterRewardsNew } from "../target/types/jupiter_rewards_new";

describe("jupiter-rewards-new", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.JupiterRewardsNew as Program<JupiterRewardsNew>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
