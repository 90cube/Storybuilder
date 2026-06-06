"""GBNF 문법 — LLM 출력을 스키마 JSON으로 디코딩 시점에 강제.

기획서 §5.1 스케치를 events/entities/relations로 확장. 전체 스키마→문법 컴파일러는 후속(경계).
"""

# 산문 청크 → {events,entities,relations} 추출용 문법.
EXTRACT_GBNF = r"""
root        ::= "{" ws "\"events\":" ws arr-ev "," ws "\"entities\":" ws arr-en "," ws "\"relations\":" ws arr-re ws "}"
arr-ev      ::= "[" ws (event (ws "," ws event)*)? ws "]"
arr-en      ::= "[" ws (entity (ws "," ws entity)*)? ws "]"
arr-re      ::= "[" ws (relation (ws "," ws relation)*)? ws "]"
event       ::= "{" ws "\"title\":" ws str "," ws "\"era\":" ws str "," ws "\"what\":" ws str "," ws "\"chars\":" ws arr-ch ws "}"
arr-ch      ::= "[" ws (chref (ws "," ws chref)*)? ws "]"
chref       ::= "{" ws "\"name\":" ws str "," ws "\"before\":" ws str "," ws "\"after\":" ws str ws "}"
entity      ::= "{" ws "\"name\":" ws str "," ws "\"category\":" ws str "," ws "\"description\":" ws str ws "}"
relation    ::= "{" ws "\"from\":" ws str "," ws "\"rel\":" ws str "," ws "\"to\":" ws str ws "}"
str         ::= "\"" chars "\""
chars       ::= ([^"\\] | "\\" ["\\/bfnrt])*
ws          ::= [ \t\n]*
"""

# 신캐 프로필 보조용 문법 (기획서 §5.2).
CHARACTER_GBNF = r"""
root        ::= "{" ws "\"name\":" ws str "," ws "\"category\":" ws str "," ws "\"description\":" ws str "," ws "\"speech_style\":" ws str "," ws "\"relations\":" ws arr-s ws "}"
arr-s       ::= "[" ws (str (ws "," ws str)*)? ws "]"
str         ::= "\"" chars "\""
chars       ::= ([^"\\] | "\\" ["\\/bfnrt])*
ws          ::= [ \t\n]*
"""
