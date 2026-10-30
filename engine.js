/**
 * スキンケア成分 併用相性・リスク判定エンジン
 * 5ステップのパイプラインで単体・枠内・朝夜またぎの相性を判定する純粋関数群
 */

// ペアIDをアルファベット昇順に正規化するヘルパー関数
function normalizePair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

// メイン判定関数
function evaluateRoutine(morningIds, nightIds, ingredients, rules) {
  const ingMap = new Map(ingredients.map(i => [i.id, i]));
  const results = [];

  // --------------------------------------------------
  // Step 1: 単体・時間帯適合チェック（軸2）
  // --------------------------------------------------
  morningIds.forEach(id => {
    const ing = ingMap.get(id);
    if (!ing) return;
    if (ing.suitable_time === "night_only" || ing.sunburn_risk) {
      results.push({
        id: `SINGLE_MORNING_${ing.id}`,
        type: "single",
        slot: "morning",
        slotLabel: "☀️ 朝枠（単体注意）",
        level: 2,
        title: `${ing.name} の朝使用に関する注意`,
        ingredients: [ing.name],
        risk_summary: "紫外線や光の影響を受けやすい、または角質ケアにより日中の肌が敏感になりやすい成分です。",
        advice: "夜のみの使用に切り替えるか、日中はSPF30以上の日焼け止めを併用して紫外線対策を徹底してください。"
      });
    }
  });

  // --------------------------------------------------
  // Step 2 & 3: 枠内ペア判定（朝枠・夜枠 / 軸1）
  // --------------------------------------------------
  function checkSameSlotPairs(slotIds, slotKey, slotLabel) {
    for (let i = 0; i < slotIds.length; i++) {
      for (let j = i + 1; j < slotIds.length; j++) {
        const [id1, id2] = normalizePair(slotIds[i], slotIds[j]);
        const ing1 = ingMap.get(id1);
        const ing2 = ingMap.get(id2);
        if (!ing1 || !ing2) continue;

        const matchedRule = rules.find(
          r => r.applies_to === "same_slot" && r.pair[0] === id1 && r.pair[1] === id2
        );

        if (matchedRule) {
          results.push({
            id: `${slotKey}_${matchedRule.id}`,
            type: "pair_same",
            slot: slotKey,
            slotLabel: slotLabel,
            level: matchedRule.level,
            title: matchedRule.title,
            ingredients: [ing1.name, ing2.name],
            risk_summary: matchedRule.risk_summary,
            advice: matchedRule.advice
          });
        } else {
          // 未定義ペアは安全側（Level 1: 併用OK）へフォールバック
          results.push({
            id: `${slotKey}_SAFE_${id1}_${id2}`,
            type: "pair_same",
            slot: slotKey,
            slotLabel: slotLabel,
            level: 1,
            title: `${ing1.name} × ${ing2.name}`,
            ingredients: [ing1.name, ing2.name],
            risk_summary: "特に問題となる相互作用や刺激リスクの報告はなく、同じタイミングで併用可能です。",
            advice: "化粧水（水溶性）からクリーム（油溶性）の順で、テクスチャーの軽いものから重ねてください。"
          });
        }
      }
    }
  }

  checkSameSlotPairs(morningIds, "morning", "☀️ 朝枠ペア");
  checkSameSlotPairs(nightIds, "night", "🌙 夜枠ペア");

  // --------------------------------------------------
  // Step 4: クロススロット判定（朝成分 × 夜成分 / 軸3）
  // --------------------------------------------------
  morningIds.forEach(mId => {
    nightIds.forEach(nId => {
      if (mId === nId) return; // 同一成分の朝夜使用は基本OKのためスキップ
      const [id1, id2] = normalizePair(mId, nId);
      const ingM = ingMap.get(mId);
      const ingN = ingMap.get(nId);
      if (!ingM || !ingN) return;

      const crossRule = rules.find(
        r => r.applies_to === "cross_slot" && r.pair[0] === id1 && r.pair[1] === id2
      );

      if (crossRule) {
        results.push({
          id: `CROSS_${crossRule.id}`,
          type: "pair_cross",
          slot: "cross",
          slotLabel: "☀️朝 × 🌙夜（使い分け）",
          level: crossRule.level,
          title: crossRule.title,
          ingredients: [`朝: ${ingM.name}`, `夜: ${ingN.name}`],
          risk_summary: crossRule.risk_summary,
          advice: crossRule.advice
        });
      }
    });
  });

  // --------------------------------------------------
  // Step 5: 結果の集約・ソート（Level 3 -> 2 -> 1）
  // --------------------------------------------------
  results.sort((a, b) => b.level - a.level);

  const warnings = results.filter(r => r.level >= 2);
  const safeItems = results.filter(r => r.level === 1);

  const overallLevel = results.reduce((max, r) => Math.max(max, r.level), 0);
  const totalCount = morningIds.length + nightIds.length;

  let uiState = 1; // State 1: 0個
  if (totalCount === 1) uiState = 2; // State 2: 1個のみ
  else if (totalCount >= 2) uiState = 3; // State 3: 2個以上（ペア判定稼働）

  return {
    uiState,
    totalCount,
    overallLevel,
    warnings,
    safeItems,
    allResults: results,
    isMorningFull: morningIds.length >= 5,
    isNightFull: nightIds.length >= 5
  };
}
