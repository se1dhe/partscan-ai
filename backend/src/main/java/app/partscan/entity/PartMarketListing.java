package app.partscan.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "part_market_listings")
public class PartMarketListing {
 @Id
 @GeneratedValue(strategy = GenerationType.UUID)
 private UUID id;

 @ManyToOne(fetch = FetchType.LAZY)
 @JoinColumn(name = "part_id", nullable = false)
 private Part part;

 private String source;

 @Column(columnDefinition = "TEXT")
 private String title;

 private Integer price;
 private String currency;

 @Column(columnDefinition = "TEXT")
 private String url;

 private String location;

 @Column(columnDefinition = "TEXT")
 private String imageUrl;

 private String matchedQuery;
 private Instant createdAt;

 @PrePersist
 void onCreate() {
  if (createdAt == null) createdAt = Instant.now();
  if (source == null || source.isBlank()) source = "OLX";
 }

 public UUID getId() { return id; }
 public void setId(UUID id) { this.id = id; }
 public Part getPart() { return part; }
 public void setPart(Part part) { this.part = part; }
 public String getSource() { return source; }
 public void setSource(String source) { this.source = source; }
 public String getTitle() { return title; }
 public void setTitle(String title) { this.title = title; }
 public Integer getPrice() { return price; }
 public void setPrice(Integer price) { this.price = price; }
 public String getCurrency() { return currency; }
 public void setCurrency(String currency) { this.currency = currency; }
 public String getUrl() { return url; }
 public void setUrl(String url) { this.url = url; }
 public String getLocation() { return location; }
 public void setLocation(String location) { this.location = location; }
 public String getImageUrl() { return imageUrl; }
 public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
 public String getMatchedQuery() { return matchedQuery; }
 public void setMatchedQuery(String matchedQuery) { this.matchedQuery = matchedQuery; }
 public Instant getCreatedAt() { return createdAt; }
 public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
