-- Mercanada veri şeması. Simülasyon deterministik olduğu için sunucu sakinlerin hayatını değil,
-- sadece kimliğini, sırasını (adres buradan hesaplanır) ve isteklerini tutar.

CREATE TABLE IF NOT EXISTS sakinler (
    handle       text    PRIMARY KEY,
    seed         bigint  NOT NULL,          -- geliş anındaki kullanıcı adından; ad değişse de karakter aynı kalır
    slot         bigint  NOT NULL UNIQUE,   -- ada → mahalle → sokak → bina → daire
    arrived_day  integer NOT NULL,          -- Türkiye saatine göre gün numarası (1970'ten beri)
    left_day     integer,                   -- takibi bıraktığı gün; 7 gün içinde dönerse aynı evine döner
    hidden       boolean NOT NULL DEFAULT false,
    overrides    jsonb   NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS sakinler_aktif ON sakinler (arrived_day) WHERE left_day IS NULL;

CREATE TABLE IF NOT EXISTS aktarimlar (
    id           bigserial   PRIMARY KEY,
    day          integer     NOT NULL,
    dosya_sha256 text        NOT NULL UNIQUE,
    takipci      integer     NOT NULL,
    gelen        integer     NOT NULL,
    donen        integer     NOT NULL,
    ayrilan      integer     NOT NULL,
    imported_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS istekler (
    id          bigserial   PRIMARY KEY,
    handle      text        NOT NULL,
    tur         text        NOT NULL,   -- meslek, hobi, evcil, gizle
    deger       text        NOT NULL,
    kaynak      text        NOT NULL,   -- yorum, dm, canli
    kaynak_id   text,                   -- Instagram yorum/mesaj kimliği; aynı yorum iki kez işlenmez
    durum       text        NOT NULL DEFAULT 'bekliyor',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kaynak, kaynak_id)
);
