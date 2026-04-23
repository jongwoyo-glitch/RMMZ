//=============================================================================
// ActorSurname.js — Actor surname (family name) support
//=============================================================================
/*:
 * @target MZ
 * @plugindesc Adds surname field to actors. Access full name via $gameActors.actor(id).fullName().
 * @author RMMZStudio
 *
 * @param NameOrder
 * @text Name display order
 * @type select
 * @option surname first (e.g. 홍 길동)
 * @value sf
 * @option name first (e.g. 길동 홍)
 * @value nf
 * @default sf
 *
 * @param Separator
 * @text Separator between surname and name
 * @type string
 * @default
 *
 * @help
 * ============================================================================
 * ActorSurname.js
 * ============================================================================
 *
 * Actors.json의 surname 필드를 게임 내에서 활용할 수 있게 합니다.
 *
 * ─── 사용법 ───
 *   $dataActors[id].surname          // 데이터에서 직접 읽기
 *   $gameActors.actor(id).surname()  // Game_Actor 메서드
 *   $gameActors.actor(id).fullName() // 성+이름 조합 (파라미터 순서 반영)
 *
 * ─── 이벤트 텍스트 제어문자 ───
 *   \SN[n]   → n번 액터의 성씨
 *   \FN[n]   → n번 액터의 풀네임 (성+이름)
 *
 * ─── 주의사항 ───
 *   surname 필드는 Actors.json에 직접 저장되는 커스텀 프로퍼티입니다.
 *   RMMZ 네이티브 에디터에서 액터를 편집하면 surname 필드가
 *   유실될 수 있습니다. RMMZStudio를 통해 편집하세요.
 *
 * ============================================================================
 */

(() => {
    "use strict";

    const params = PluginManager.parameters("ActorSurname");
    const nameOrder = (params["NameOrder"] || "sf").trim();
    const separator = params["Separator"] !== undefined ? params["Separator"] : " ";

    // --- Game_Actor extensions ---

    Game_Actor.prototype.surname = function() {
        return $dataActors[this._actorId]?.surname || "";
    };

    Game_Actor.prototype.fullName = function() {
        const s = this.surname();
        const n = this._name || "";
        if (!s) return n;
        if (!n) return s;
        if (nameOrder === "nf") return n + separator + s;
        return s + separator + n;
    };

    // --- Text escape codes: \SN[n] and \FN[n] ---

    const _Window_Base_convertEscapeCharacters =
        Window_Base.prototype.convertEscapeCharacters;

    Window_Base.prototype.convertEscapeCharacters = function(text) {
        text = _Window_Base_convertEscapeCharacters.call(this, text);
        text = text.replace(/\x1bSN\[(\d+)\]/gi, (_, id) => {
            const actor = $gameActors.actor(parseInt(id));
            return actor ? actor.surname() : "";
        });
        text = text.replace(/\x1bFN\[(\d+)\]/gi, (_, id) => {
            const actor = $gameActors.actor(parseInt(id));
            return actor ? actor.fullName() : "";
        });
        return text;
    };

})();
