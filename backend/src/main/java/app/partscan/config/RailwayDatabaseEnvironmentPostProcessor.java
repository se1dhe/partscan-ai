package app.partscan.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.util.StringUtils;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

public class RailwayDatabaseEnvironmentPostProcessor implements EnvironmentPostProcessor {
 @Override
 public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
  if (StringUtils.hasText(environment.getProperty("SPRING_DATASOURCE_URL"))) return;

  Map<String, Object> properties = new HashMap<>();
  addFromDatabaseUrl(environment, properties);
  addFromPgVars(environment, properties);

  if (!properties.isEmpty()) {
   environment.getPropertySources().addFirst(new MapPropertySource("railwayDatabase", properties));
  }
 }

 private void addFromDatabaseUrl(ConfigurableEnvironment environment, Map<String, Object> properties) {
  String databaseUrl = environment.getProperty("DATABASE_URL");
  if (!StringUtils.hasText(databaseUrl)) return;

  try {
   URI uri = URI.create(databaseUrl);
   String scheme = uri.getScheme();
   if (!"postgres".equals(scheme) && !"postgresql".equals(scheme)) return;

   String[] userInfo = uri.getUserInfo() == null ? new String[] {"", ""} : uri.getUserInfo().split(":", 2);
   int port = uri.getPort() > 0 ? uri.getPort() : 5432;
   String query = StringUtils.hasText(uri.getQuery()) ? "?" + uri.getQuery() : "";
   properties.put("spring.datasource.url", "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getPath() + query);
   if (userInfo.length > 0) properties.put("spring.datasource.username", userInfo[0]);
   if (userInfo.length > 1) properties.put("spring.datasource.password", userInfo[1]);
  } catch (IllegalArgumentException ignored) {
  }
 }

 private void addFromPgVars(ConfigurableEnvironment environment, Map<String, Object> properties) {
  if (properties.containsKey("spring.datasource.url")) return;

  String host = environment.getProperty("PGHOST");
  String port = environment.getProperty("PGPORT", "5432");
  String database = environment.getProperty("PGDATABASE");
  if (!StringUtils.hasText(host) || !StringUtils.hasText(database)) return;

  properties.put("spring.datasource.url", "jdbc:postgresql://" + host + ":" + port + "/" + database);
  putIfPresent(environment, properties, "PGUSER", "spring.datasource.username");
  putIfPresent(environment, properties, "PGPASSWORD", "spring.datasource.password");
 }

 private void putIfPresent(ConfigurableEnvironment environment, Map<String, Object> properties, String envName, String propertyName) {
  String value = environment.getProperty(envName);
  if (StringUtils.hasText(value)) properties.put(propertyName, value);
 }
}
