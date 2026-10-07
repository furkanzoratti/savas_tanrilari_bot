import { describe, expect, it } from "vitest";
import { settlementTransferPolicy } from "./settlement-transfer.js";

describe("yerleşke devir türleri", () => {
  it("fethi asimilasyon ve eski sahip iddiasıyla kaydeder", () => {
    expect(settlementTransferPolicy("CONQUEST")).toMatchObject({
      historyType: "CONQUEST", conquered: true, restorationClaim: true
    });
  });

  it("barış antlaşmasında fetih cezası olmadan eski sahip iddiasını korur", () => {
    expect(settlementTransferPolicy("PEACE_TRANSFER")).toMatchObject({
      historyType: "PEACE_TRANSFER", conquered: false, restorationClaim: true
    });
  });

  it("dostça devirde fetih ve eski sahip geri dönüş iddiası oluşturmaz", () => {
    expect(settlementTransferPolicy("VOLUNTARY_TRANSFER")).toMatchObject({
      historyType: "VOLUNTARY_TRANSFER", conquered: false, restorationClaim: false
    });
  });
});
