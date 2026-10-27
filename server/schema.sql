-- Mercanada veri şeması. Simülasyon deterministik olduğu için sunucu sakinlerin hayatını değil,
-- sadece kimliğini, sırasını (adres buradan hesaplanır) ve isteklerini tutar.
-- Sakinler TikTok takipçilerinden gelir (platform 'tt'); başka platform eklenirse aynı kullanıcı adı
-- ayrı bir sakin olur (tohum değeri platform önekiyle hesaplanır).

CREATE TABLE IF NOT EXISTS sakinler (
    platform     text    NOT NULL DEFAULT 'tt',
    handle       text    NOT NULL,
    seed         bigint  NOT NULL,          -- sim.seed_of('<platform>:<handle>'): ad aynıysa karakter aynı
    slot         bigint  NOT NULL UNIQUE,   -- ada → mahalle → sokak → bina → daire
    arrived_day  integer NOT NULL,          -- Türkiye saatine göre gün numarası (1970'ten beri)
    left_day     integer,                   -- takibi bıraktığı gün; 7 gün içinde dönerse aynı evine döner,
                                            -- sonra kayıt silinir ve ev yeni gelene verilir
    hidden       boolean NOT NULL DEFAULT false,
    overrides    jsonb   NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (platform, handle)
);
CREATE INDEX IF NOT EXISTS sakinler_aktif ON sakinler (arrived_day) WHERE left_day IS NULL;

-- Adadan çıkmak isteyenler (KVKK): kullanıcı adının kendisi değil, sha256 özeti tutulur;
-- sonraki aktarımlarda bu kişiler taşınmaz.
CREATE TABLE IF NOT EXISTS cikanlar (
    ozet  text    PRIMARY KEY,
    day   integer NOT NULL
);

CREATE TABLE IF NOT EXISTS aktarimlar (
    id           bigserial   PRIMARY KEY,
    platform     text        NOT NULL DEFAULT 'tt',
    day          integer     NOT NULL,
    dosya_sha256 text        NOT NULL UNIQUE,
    takipci      integer     NOT NULL,
    gelen        integer     NOT NULL,
    donen        integer     NOT NULL,
    ayrilan      integer     NOT NULL,
    silinen      integer     NOT NULL DEFAULT 0,
    imported_at  timestamptz NOT NULL DEFAULT now()
);

-- Anahtar/değer durum: ör. 'tt_takipci' (TikTok API'den saatlik takipçi sayısı).
CREATE TABLE IF NOT EXISTS durum (
    anahtar     text        PRIMARY KEY,
    deger       jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS istekler (
    id          bigserial   PRIMARY KEY,
    handle      text        NOT NULL,
    tur         text        NOT NULL,   -- meslek, hobi, evcil, gizle
    deger       text        NOT NULL,
    kaynak      text        NOT NULL,   -- yorum, dm, canli
    kaynak_id   text,                   -- yorum/mesaj kimliği; aynı yorum iki kez işlenmez
    durum       text        NOT NULL DEFAULT 'bekliyor',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kaynak, kaynak_id)
);
