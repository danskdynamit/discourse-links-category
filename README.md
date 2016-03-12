# Discourse Links Category

Provides a solved button on designated categories

## License

GPlv3. Copyright (C) 2016 [Dansk Dynamit](https://github.com/danskdynamit)

## Design Explanation

- CategoryCustomField is a common place to store small settings. It is serialized by site serializer.
- For minimizing changes to Composer, a new field was created, the other components are hidden. There is no better way to hide composer components.
