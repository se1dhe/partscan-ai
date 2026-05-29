package app.partscan.repository;
import app.partscan.entity.Part;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface PartRepository extends JpaRepository<Part, UUID> {}
