"""Leitor mínimo do formato custom do pg_dump (PGDMP). Só leitura; sem dependências externas."""
import struct, zlib, io


class Dump:
    def __init__(self, path):
        self.f = open(path, "rb")
        f = self.f
        assert f.read(5) == b"PGDMP"
        self.vmaj, self.vmin, self.vrev = f.read(1)[0], f.read(1)[0], f.read(1)[0]
        self.int_size = f.read(1)[0]
        self.off_size = f.read(1)[0]
        self.format = f.read(1)[0]
        assert self.format == 1, "não é formato custom"
        self.version = (self.vmaj, self.vmin, self.vrev)
        self.compression = "none"
        if self.version >= (1, 15, 0):
            alg = f.read(1)[0]
            self.compression = {0: "none", 1: "gzip", 2: "lz4", 3: "zstd"}.get(alg, str(alg))
        else:
            level = self.read_int()
            self.compression = "gzip" if level != 0 else "none"
        for _ in range(7):
            self.read_int()  # data de criação
        self.dbname = self.read_str()
        self.server_version = self.read_str()
        self.dump_version = self.read_str()
        self.toc = []
        n = self.read_int()
        for _ in range(n):
            self.toc.append(self.read_toc_entry())

    def read_int(self):
        sign = self.f.read(1)[0]
        v = 0
        for i in range(self.int_size):
            v |= self.f.read(1)[0] << (8 * i)
        return -v if sign else v

    def read_str(self):
        n = self.read_int()
        if n < 0:
            return None
        return self.f.read(n).decode("utf-8", "replace")

    def read_offset(self):
        flag = self.f.read(1)[0]
        v = 0
        for i in range(self.off_size):
            v |= self.f.read(1)[0] << (8 * i)
        return flag, v

    def read_toc_entry(self):
        e = {}
        e["dump_id"] = self.read_int()
        e["had_dumper"] = self.read_int()
        e["table_oid"] = self.read_str()
        e["oid"] = self.read_str()
        e["tag"] = self.read_str()
        e["desc"] = self.read_str()
        e["section"] = self.read_int()
        e["defn"] = self.read_str()
        e["drop"] = self.read_str()
        e["copy"] = self.read_str()
        e["namespace"] = self.read_str()
        e["tablespace"] = self.read_str()
        if self.version >= (1, 14, 0):
            e["tableam"] = self.read_str()
        if self.version >= (1, 16, 0):
            e["relkind"] = self.read_int()
        e["owner"] = self.read_str()
        self.read_str()  # with_oids
        deps = []
        while True:
            d = self.read_str()
            if d is None:
                break
            deps.append(d)
        e["deps"] = deps
        e["flag"], e["offset"] = self.read_offset()
        return e

    def read_data(self, entry):
        """Devolve o texto COPY (bytes) da entrada."""
        flag, off = entry["flag"], entry["offset"]
        if flag != 2:  # 2 = PRESERVE_OFFSET_SET
            return None
        self.f.seek(off)
        btype = self.f.read(1)[0]
        dump_id = self.read_int()
        assert btype == 1 and dump_id == entry["dump_id"], (btype, dump_id, entry["dump_id"])
        chunks = []
        while True:
            n = self.read_int()
            if n == 0:
                break
            chunks.append(self.f.read(n))
        raw = b"".join(chunks)
        if self.compression == "gzip":
            raw = zlib.decompress(raw)
        elif self.compression != "none":
            raise RuntimeError("compressão não suportada: " + self.compression)
        return raw


def unescape_copy(field: str):
    """Campo do formato COPY texto -> str ou None."""
    if field == "\\N":
        return None
    if "\\" not in field:
        return field
    out, i, n = [], 0, len(field)
    while i < n:
        c = field[i]
        if c == "\\" and i + 1 < n:
            d = field[i + 1]
            mapping = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "\\": "\\"}
            out.append(mapping.get(d, d))
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)
