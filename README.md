# Nexus
Real-time collaborative code editor with CRDT-based conflict resolution and live cursors

## Quick demo

```bash
python -c "from crdt import Document; d=Document(); d.insert('A',1,'H',0); d.insert('A',2,'i',1); d.delete('A',1); print(d.get_text()); j=d.to_json(); print(j); d2=Document.from_json(j); print(d2.get_text())"
```
