from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Tuple
import json


CharID = Tuple[str, int]


@dataclass(slots=True)
class Character:
    id: CharID
    value: str
    tombstone: bool = False

    def to_dict(self) -> Dict[str, Any]:
        site_id, counter = self.id
        return {"id": [site_id, counter], "value": self.value, "tombstone": self.tombstone}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Character":
        raw_id = data["id"]
        if (
            not isinstance(raw_id, (list, tuple))
            or len(raw_id) != 2
            or not isinstance(raw_id[0], str)
        ):
            raise ValueError("Character.id must be [site_id, counter]")
        site_id = raw_id[0]
        counter = int(raw_id[1])
        value = data.get("value", "")
        tombstone = bool(data.get("tombstone", False))
        return cls(id=(site_id, counter), value=value, tombstone=tombstone)


@dataclass
class Document:
    characters: List[Character]

    def __init__(self, characters: Optional[List[Character]] = None) -> None:
        self.characters = list(characters) if characters is not None else []

    def _find_pos_by_id(self, char_id: CharID) -> Optional[int]:
        for i, ch in enumerate(self.characters):
            if ch.id == char_id:
                return i
        return None

    def _list_index_for_visible_index(self, index: int) -> int:
        if index <= 0:
            return 0

        visible_seen = 0
        for i, ch in enumerate(self.characters):
            if ch.tombstone:
                continue
            if visible_seen == index:
                return i
            visible_seen += 1

        return len(self.characters)

    def insert(self, site_id: str, counter: int, value: str, index: int) -> None:
        """
        Insert a character at the given visible index.

        - IDs are unique; repeated inserts with the same (site_id, counter) are idempotent.
        - If a delete arrived earlier for the same ID, this call fills the placeholder but keeps
          the tombstone (i.e., delete wins for that ID).
        """
        if not isinstance(value, str) or len(value) != 1:
            raise ValueError("value must be a single character string")

        char_id: CharID = (site_id, int(counter))
        existing_pos = self._find_pos_by_id(char_id)

        if existing_pos is not None:
            existing = self.characters[existing_pos]
            if existing.value == "" and value != "":
                existing.value = value
            else:
                existing.value = existing.value or value
            return

        pos = self._list_index_for_visible_index(int(index))
        self.characters.insert(pos, Character(id=char_id, value=value, tombstone=False))

    def delete(self, site_id: str, counter: int) -> None:
        """
        Mark a character as deleted via tombstone.

        - If the character doesn't exist yet, create a tombstone placeholder so that a later
          insert with the same ID won't resurrect it.
        """
        char_id: CharID = (site_id, int(counter))
        pos = self._find_pos_by_id(char_id)
        if pos is None:
            self.characters.append(Character(id=char_id, value="", tombstone=True))
            return
        self.characters[pos].tombstone = True

    def get_text(self) -> str:
        return "".join(ch.value for ch in self.characters if not ch.tombstone and ch.value)

    def to_json(self) -> str:
        payload = {"characters": [ch.to_dict() for ch in self.characters]}
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)

    @classmethod
    def from_json(cls, s: str) -> "Document":
        data = json.loads(s)
        chars_raw = data.get("characters", [])
        if not isinstance(chars_raw, list):
            raise ValueError("Document.characters must be a list")
        chars = [Character.from_dict(item) for item in chars_raw]
        return cls(characters=chars)

