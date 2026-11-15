# pulls everything build.js needs into one folder: the animal tree out of wikidata (through the qlever mirror,
# which answers these in seconds) and the fossil dates out of the paleobiology database.
#   bash js/distant-cousins/tools/export.sh <raw folder>
#   node --max-old-space-size=6000 js/distant-cousins/tools/build.js <raw folder>
# keep the raw folder out of the repo, it's about 700 MB.
# big answers get cut off halfway unless they're compressed and asked for 500,000 rows at a time, so every
# query goes through getp, which pages and checks each page ends on a whole line.
R=${1:?give a folder for the raw files}
mkdir -p "$R"
P='PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> PREFIX schema: <http://schema.org/> PREFIX skos: <http://www.w3.org/2004/02/skos/core#> PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX p: <http://www.wikidata.org/prop/> PREFIX psv: <http://www.wikidata.org/prop/statement/value/>'
A='?t wdt:P171+ wd:Q729 .'
N=500000
getp() {
  out=$R/$1.tsv
  [ -s "$out" ] && { echo "have $1"; return; }
  : > "$out.part"; off=0
  while :; do
    for try in 1 2 3 4 5; do
      curl -s -L --compressed --fail -G https://qlever.dev/api/wikidata --data-urlencode "query=$P $2 LIMIT $N OFFSET $off" \
        -H 'Accept: text/tab-separated-values' -o "$R/page.tsv" && [ "$(tail -c1 "$R/page.tsv" | od -An -c | tr -d ' ')" = '\n' ] && break
      echo "  again: $1 from $off"; sleep 5
    done
    rows=$(($(wc -l < "$R/page.tsv") - 1))
    [ $off = 0 ] && head -1 "$R/page.tsv" >> "$out.part"
    tail -n +2 "$R/page.tsv" >> "$out.part"
    echo "$1: $((off + rows)) rows"
    [ $rows -lt $N ] && break
    off=$((off + N))
  done
  mv "$out.part" "$out"; rm -f "$R/page.tsv"
}
getp edges  "SELECT ?t ?p WHERE { $A ?t wdt:P171 ?p } ORDER BY ?t"
getp names  "SELECT ?t ?n WHERE { $A ?t wdt:P225 ?n } ORDER BY ?t"
getp labels "SELECT ?t ?l WHERE { $A ?t rdfs:label ?l . FILTER(LANG(?l)='en') } ORDER BY ?t"
getp links  "SELECT ?t ?s WHERE { $A ?t wikibase:sitelinks ?s FILTER(?s > 0) } ORDER BY ?t"
getp enwiki "SELECT ?t ?w WHERE { $A ?a schema:about ?t ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?w } ORDER BY ?t"
getp images "SELECT ?t ?i WHERE { $A ?t wdt:P18 ?i } ORDER BY ?t"
getp common "SELECT ?t ?c WHERE { $A ?t wdt:P1843 ?c . FILTER(LANG(?c)='en') } ORDER BY ?t"
getp alt    "SELECT ?t ?c WHERE { $A ?t skos:altLabel ?c . FILTER(LANG(?c)='en') } ORDER BY ?t"
getp ranks  "SELECT ?t ?r WHERE { $A ?t wdt:P105 ?r } ORDER BY ?t"
getp fossil "SELECT ?t WHERE { $A ?t wdt:P31 wd:Q23038290 } ORDER BY ?t"
getp iucn   "SELECT ?t ?s WHERE { $A ?t wdt:P141 ?s } ORDER BY ?t"
getp pbdb   "SELECT ?t ?id WHERE { $A ?t wdt:P10907 ?id } ORDER BY ?t"
# entries that aren't creatures: synonyms, misspellings, footprints and eggs (ichno- and ootaxa), dubious names,
# and words like "fish" or "worm" that aren't branches of the tree
getp junk   "SELECT DISTINCT ?t WHERE { $A ?t wdt:P31 ?c . VALUES ?c { wd:Q1040689 wd:Q17487588 wd:Q42310380 wd:Q17276484 wd:Q1984758 wd:Q2568288 wd:Q2491016 wd:Q110533142 wd:Q922448 wd:Q59278506 wd:Q14594740 wd:Q7882332 wd:Q59511375 wd:Q6015290 wd:Q844326 wd:Q55983715 } } ORDER BY ?t"
# the same creature in the databases phylopic links its silhouettes to
getp gbif   "SELECT ?t ?id WHERE { $A ?t wdt:P846 ?id } ORDER BY ?t"
getp ncbi   "SELECT ?t ?id WHERE { $A ?t wdt:P685 ?id } ORDER BY ?t"
getp ott    "SELECT ?t ?id WHERE { $A ?t wdt:P9157 ?id } ORDER BY ?t"
# how heavy, with its unit, for comparing two creatures
getp mass   "SELECT ?t ?v ?u WHERE { $A ?t p:P2067/psv:P2067 ?s . ?s wikibase:quantityAmount ?v ; wikibase:quantityUnit ?u } ORDER BY ?t"
# the line from the first life up to animals, and the other branches off it (plants, bacteria...)
getp toppar "SELECT ?t ?p ?n ?l ?w ?i WHERE { wd:Q729 wdt:P171* ?t . OPTIONAL { ?t wdt:P171 ?p } OPTIONAL { ?t wdt:P225 ?n } OPTIONAL { ?t rdfs:label ?l . FILTER(LANG(?l)='en') } OPTIONAL { ?a schema:about ?t ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?w } OPTIONAL { ?t wdt:P18 ?i } }"
getp topx   "SELECT ?t ?p ?n ?l ?s ?w ?i WHERE { wd:Q729 wdt:P171* ?p . ?t wdt:P171 ?p . FILTER(?t != wd:Q729) OPTIONAL { ?t wdt:P225 ?n } OPTIONAL { ?t rdfs:label ?l . FILTER(LANG(?l)='en') } OPTIONAL { ?t wikibase:sitelinks ?s } OPTIONAL { ?a schema:about ?t ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?w } OPTIONAL { ?t wdt:P18 ?i } }"
getp rankl  "SELECT DISTINCT ?r ?l WHERE { ?x wdt:P105 ?r . ?r rdfs:label ?l . FILTER(LANG(?l)='en') }"
# fossil dates for every accepted animal name
[ -s "$R/pbdb-taxa.txt" ] || curl -s --compressed --fail 'https://paleobiodb.org/data1.2/taxa/list.txt?base_name=Metazoa&taxon_status=accepted&show=app' -o "$R/pbdb-taxa.txt"
echo "pbdb: $(wc -l < "$R/pbdb-taxa.txt") lines"
